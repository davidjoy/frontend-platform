import axios from 'axios';
import PropTypes from 'prop-types';
import { logFrontendAuthError } from './utils';
import { camelCaseObject } from '../utils';
import createJwtTokenProviderInterceptor from './interceptors/createJwtTokenProviderInterceptor';
import createCsrfTokenProviderInterceptor from './interceptors/createCsrfTokenProviderInterceptor';
import createProcessAxiosRequestErrorInterceptor from './interceptors/createProcessAxiosRequestErrorInterceptor';
import AxiosJwtTokenService from './AxiosJwtTokenService';
import AxiosCsrfTokenService from './AxiosCsrfTokenService';
import configureCache from './LocalForageCache';
import AbstractAuthService, { abstractOptionsPropTypes } from './AbstractAuthService';

/**
 * @implements {AuthService}
 * @memberof module:Auth
 */
class AxiosJwtAuthService extends AbstractAuthService {
  /**
   * @param {Object} options
   * @param {Object} options.config
   * @param {string} options.config.BASE_URL
   * @param {string} options.config.LMS_BASE_URL
   * @param {string} options.config.LOGIN_URL
   * @param {string} options.config.LOGOUT_URL
   * @param {string} options.config.REFRESH_ACCESS_TOKEN_ENDPOINT
   * @param {string} options.config.ACCESS_TOKEN_COOKIE_NAME
   * @param {string} options.config.CSRF_TOKEN_API_PATH
   * @param {Object} options.loggingService requires logError and logInfo methods
   */
  constructor(options) {
    super(options);

    PropTypes.checkPropTypes(abstractOptionsPropTypes, options, 'options', 'AuthService');

    this.jwtTokenService = new AxiosJwtTokenService(
      this.loggingService,
      this.config.ACCESS_TOKEN_COOKIE_NAME,
      this.config.REFRESH_ACCESS_TOKEN_ENDPOINT,
    );
    this.csrfTokenService = new AxiosCsrfTokenService(this.config.CSRF_TOKEN_API_PATH);

    this.authenticatedHttpClient = this.addAuthenticationToHttpClient(axios.create());
    this.httpClient = axios.create();

    this.cachedAuthenticatedHttpClient = null;
    this.cachedHttpClient = null;

    configureCache()
      .then((cachedAxiosClient) => {
        this.cachedAuthenticatedHttpClient = this.addAuthenticationToHttpClient(cachedAxiosClient);
        this.cachedHttpClient = cachedAxiosClient;
      })
      .catch((e) => {
        // fallback to non-cached HTTP clients and log error
        this.cachedAuthenticatedHttpClient = this.authenticatedHttpClient;
        this.cachedHttpClient = this.httpClient;
        logFrontendAuthError(this.loggingService, `configureCache failed with error: ${e.message}`);
      }).finally(() => {
        this.middleware = options.middleware;
        this.applyMiddleware(options.middleware);
      });
  }

  /**
   * Provides a list of middleware clients.
   *
   * @ignore
   */
  getMiddlewareClients() {
    return [
      this.authenticatedHttpClient,
      this.httpClient,
      this.cachedAuthenticatedHttpClient,
      this.cachedHttpClient,
    ];
  }

  /**
   * Gets the authenticated HTTP client for the service.  This is an axios instance.
   *
   * @param {Object} [options] Optional options for how the HTTP client should be configured.
   * @param {boolean} [options.useCache] Whether to use front end caching for all requests made
   * with the returned client.
   *
   * @returns {HttpClient} A configured axios http client which can be used for authenticated
   * requests.
   */
  getAuthenticatedHttpClient(options = {}) {
    if (options.useCache) {
      return this.cachedAuthenticatedHttpClient;
    }

    return super.getAuthenticatedHttpClient();
  }

  /**
   * Gets the unauthenticated HTTP client for the service.  This is an axios instance.
   *
   * @param {Object} [options] Optional options for how the HTTP client should be configured.
   * @param {boolean} [options.useCache] Whether to use front end caching for all requests made
   * with the returned client.
   * @returns {HttpClient} A configured axios http client.
   */
  getHttpClient(options = {}) {
    if (options.useCache) {
      return this.cachedHttpClient;
    }

    return super.getHttpClient();
  }

  /**
   * Used primarily for testing.
   *
   * @ignore
   */
  getJwtTokenService() {
    return this.jwtTokenService;
  }

  /**
   * Used primarily for testing.
   *
   * @ignore
   */
  getCsrfTokenService() {
    return this.csrfTokenService;
  }

  /**
   * Reads the authenticated user's access token. Resolves to null if the user is
   * unauthenticated.
   *
   * @returns {Promise<UserData>|Promise<null>} Resolves to the user's access token if they are
   * logged in.
   */
  async fetchAuthenticatedUser(options = {}) {
    const decodedAccessToken = await this.jwtTokenService.getJwtToken(options.forceRefresh || false);

    if (decodedAccessToken !== null) {
      this.setAuthenticatedUser({
        email: decodedAccessToken.email,
        userId: decodedAccessToken.user_id,
        username: decodedAccessToken.preferred_username,
        roles: decodedAccessToken.roles || [],
        administrator: decodedAccessToken.administrator,
        name: decodedAccessToken.name,
      });
    } else {
      this.setAuthenticatedUser(null);
    }

    return this.getAuthenticatedUser();
  }

  /**
   * Ensures a user is authenticated. It will redirect to login when not
   * authenticated.
   *
   * @param {string} [redirectUrl=config.BASE_URL] to return user after login when not
   * authenticated.
   * @returns {Promise<UserData>}
   */
  async ensureAuthenticatedUser(redirectUrl = this.config.BASE_URL) {
    await this.fetchAuthenticatedUser();

    if (this.getAuthenticatedUser() === null) {
      const isRedirectFromLoginPage = global.document.referrer
        && global.document.referrer.startsWith(this.config.LOGIN_URL);

      if (isRedirectFromLoginPage) {
        const redirectLoopError = new Error('Redirect from login page. Rejecting to avoid infinite redirect loop.');
        logFrontendAuthError(this.loggingService, redirectLoopError);
        throw redirectLoopError;
      }

      // The user is not authenticated, send them to the login page.
      this.redirectToLogin(redirectUrl);

      const unauthorizedError = new Error('Failed to ensure the user is authenticated');
      unauthorizedError.isRedirecting = true;
      throw unauthorizedError;
    }

    return this.getAuthenticatedUser();
  }

  /**
   * Fetches additional user account information for the authenticated user and merges it into the
   * existing authenticatedUser object, available via getAuthenticatedUser().
   *
   * ```
   *  console.log(authenticatedUser); // Will be sparse and only contain basic information.
   *  await hydrateAuthenticatedUser()
   *  const authenticatedUser = getAuthenticatedUser();
   *  console.log(authenticatedUser); // Will contain additional user information
   * ```
   *
   * @returns {Promise<null>}
   */
  async hydrateAuthenticatedUser() {
    const user = this.getAuthenticatedUser();
    if (user !== null) {
      const response = await this.authenticatedHttpClient
        .get(`${this.config.LMS_BASE_URL}/api/user/v1/accounts/${user.username}`);
      this.setAuthenticatedUser({ ...user, ...camelCaseObject(response.data) });
    }
  }

  /**
 * Adds authentication defaults and interceptors to an HTTP client instance.
 *
 * @param {HttpClient} newHttpClient
 * @param {Object} config
 * @param {string} [config.REFRESH_ACCESS_TOKEN_ENDPOINT]
 * @param {string} [config.ACCESS_TOKEN_COOKIE_NAME]
 * @param {string} [config.CSRF_TOKEN_API_PATH]
 * @returns {HttpClient} A configured Axios HTTP client.
 */
  addAuthenticationToHttpClient(newHttpClient) {
    const httpClient = Object.create(newHttpClient);
    // Set withCredentials to true. Enables cross-site Access-Control requests
    // to be made using cookies, authorization headers or TLS client
    // certificates. More on MDN:
    // https://developer.mozilla.org/en-US/docs/Web/API/XMLHttpRequest/withCredentials
    httpClient.defaults.withCredentials = true;

    // Axios interceptors

    // The JWT access token interceptor attempts to refresh the user's jwt token
    // before any request unless the isPublic flag is set on the request config.
    const refreshAccessTokenInterceptor = createJwtTokenProviderInterceptor({
      jwtTokenService: this.jwtTokenService,
      shouldSkip: axiosRequestConfig => axiosRequestConfig.isPublic,
    });
    // The CSRF token intercepter fetches and caches a csrf token for any post,
    // put, patch, or delete request. That token is then added to the request
    // headers.
    const attachCsrfTokenInterceptor = createCsrfTokenProviderInterceptor({
      csrfTokenService: this.csrfTokenService,
      CSRF_TOKEN_API_PATH: this.config.CSRF_TOKEN_API_PATH,
      shouldSkip: (axiosRequestConfig) => {
        const { method, isCsrfExempt } = axiosRequestConfig;
        const CSRF_PROTECTED_METHODS = ['post', 'put', 'patch', 'delete'];
        return isCsrfExempt || !CSRF_PROTECTED_METHODS.includes(method);
      },
    });

    const processAxiosRequestErrorInterceptor = createProcessAxiosRequestErrorInterceptor({
      loggingService: this.loggingService,
    });

    // Request interceptors: Axios runs the interceptors in reverse order from
    // how they are listed. After fetching csrf tokens no longer require jwt
    // authentication, it won't matter which happens first. This change is
    // coming soon in edx-platform. Nov. 2019
    httpClient.interceptors.request.use(attachCsrfTokenInterceptor);
    httpClient.interceptors.request.use(refreshAccessTokenInterceptor);

    // Response interceptor: moves axios response error data into the error
    // object at error.customAttributes
    httpClient.interceptors.response.use(
      response => response,
      processAxiosRequestErrorInterceptor,
    );

    return httpClient;
  }
}

export default AxiosJwtAuthService;
