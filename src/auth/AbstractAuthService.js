import PropTypes from 'prop-types';
import { ensureDefinedConfig } from '../utils';
import { logFrontendAuthError } from './utils';

export const abstractOptionsPropTypes = {
  config: PropTypes.shape({
    BASE_URL: PropTypes.string.isRequired,
    LMS_BASE_URL: PropTypes.string.isRequired,
    LOGIN_URL: PropTypes.string.isRequired,
    LOGOUT_URL: PropTypes.string.isRequired,
    REFRESH_ACCESS_TOKEN_ENDPOINT: PropTypes.string.isRequired,
    ACCESS_TOKEN_COOKIE_NAME: PropTypes.string.isRequired,
    CSRF_TOKEN_API_PATH: PropTypes.string.isRequired,
  }).isRequired,
  loggingService: PropTypes.shape({
    logError: PropTypes.func.isRequired,
    logInfo: PropTypes.func.isRequired,
  }).isRequired,
};

/**
 * The AbstractAuthService is a base class for auth services.
 *
 * It implements some common methods that all auth services tend to share.  Still others, such as
 * ensureAuthenticatedUser, it leaves unimplemented expecting that it will be different for each
 * implementation.
 *
 * @memberof module:Auth
 */

class AbstractAuthService {

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
    this.authenticatedHttpClient = null;
    this.httpClient = null;
    this.authenticatedUser = null;

    ensureDefinedConfig(options, 'AuthService');

    this.config = options.config;
    this.loggingService = options.loggingService;
  }

  /**
   * Provides a list of middleware clients.
   *
   * @ignore
   */
  getMiddlewareClients() {
    return [
      this.authenticatedHttpClient,
      this.httpClient
    ];
  }

  /**
   * Applies middleware to the axios instances in this service.
   *
   * @param {Array} middleware Middleware to apply.
   */
  applyMiddleware(middleware = []) {
    const clients = this.getMiddlewareClients();
    try {
      (middleware).forEach((middlewareFn) => {
        clients.forEach((client) => client && middlewareFn(client));
      });
    } catch (error) {
      logFrontendAuthError(this.loggingService, error);
      throw error;
    }
  }

  /**
   * A Jest mock function (jest.fn())
   *
   * Gets the authenticated HTTP client instance, which is an axios client wrapped in
   * MockAdapter from axios-mock-adapter.
   *
   * @returns {HttpClient} An HttpClient wrapped in MockAdapter.
   */
  getAuthenticatedHttpClient() {
    return this.authenticatedHttpClient;
  }


  /**
   * A Jest mock function (jest.fn())
   *
   * Gets the unauthenticated HTTP client instance, which is an axios client wrapped in
   * MockAdapter from axios-mock-adapter.
   *
   * @returns {HttpClient} An HttpClient wrapped in MockAdapter.
   */
  getHttpClient() {
    return this.httpClient;
  }

  /**
   * Builds a URL to the login page with a post-login redirect URL attached as a query parameter.
   *
   * ```
   * const url = getLoginRedirectUrl('http://localhost/mypage');
   * console.log(url); // http://localhost/login?next=http%3A%2F%2Flocalhost%2Fmypage
   * ```
   *
   * @param {string} redirectUrl The URL the user should be redirected to after logging in.
   */
   getLoginRedirectUrl(redirectUrl = this.config.BASE_URL) {
    return `${this.config.LOGIN_URL}?next=${encodeURIComponent(redirectUrl)}`;
  }

  /**
   * Redirects the user to the login page.
   *
   * @param {string} redirectUrl The URL the user should be redirected to after logging in.
   */
  redirectToLogin(redirectUrl = this.config.BASE_URL) {
    global.location.assign(this.getLoginRedirectUrl(redirectUrl));
  }

  /**
   * Builds a URL to the logout page with a post-logout redirect URL attached as a query parameter.
   *
   * ```
   * const url = getLogoutRedirectUrl('http://localhost/mypage');
   * console.log(url); // http://localhost/logout?next=http%3A%2F%2Flocalhost%2Fmypage
   * ```
   *
   * @param {string} redirectUrl The URL the user should be redirected to after logging out.
   */
   getLogoutRedirectUrl(redirectUrl = this.config.BASE_URL) {
    return `${this.config.LOGOUT_URL}?redirect_url=${encodeURIComponent(redirectUrl)}`;
  }

  /**
   * Redirects the user to the logout page.
   *
   * @param {string} redirectUrl The URL the user should be redirected to after logging out.
   */
  redirectToLogout(redirectUrl = this.config.BASE_URL) {
    global.location.assign(this.getLogoutRedirectUrl(redirectUrl));
  }

  /**
   * If it exists, returns the user data representing the currently authenticated user. If the
   * user is anonymous, returns null.
   *
   * @returns {UserData|null}
   */
  getAuthenticatedUser() {
    return this.authenticatedUser;
  }

  /**
   * Sets the authenticated user to the provided value.
   *
   * @param {UserData} authUser
   */
  setAuthenticatedUser(authUser) {
    this.authenticatedUser = authUser;
  }

  async fetchAuthenticatedUser() {
    throw new Error('Subclasses must implement fetchAuthenticatedUser.');
  }

  async ensureAuthenticatedUser() {
    throw new Error('Subclasses must implement ensureAuthenticatedUser.');
  }

  async hydrateAuthenticatedUser() {
    throw new Error('Subclasses must implement hydrateAuthenticatedUser.');
  }

}

export default AbstractAuthService;
