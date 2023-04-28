import axios from 'axios';
import PropTypes from 'prop-types';
import { logFrontendAuthError } from './utils';
import AbstractAuthService, { abstractOptionsPropTypes } from './AbstractAuthService';
import createApiInterceptor from './interceptors/createApiInterceptor';

const userPropTypes = PropTypes.shape({
  userId: PropTypes.string.isRequired,
  username: PropTypes.string.isRequired,
  roles: PropTypes.arrayOf(PropTypes.string),
  administrator: PropTypes.boolean,
});

const optionsPropTypes = {
  ...abstractOptionsPropTypes,

  // The absence of authenticatedUser means the user is anonymous.
  authenticatedUser: userPropTypes,
  // Must be at least a valid user, but may have other fields.
  hydratedAuthenticatedUser: userPropTypes,
};

/**
 * The DevelopmentAuthService class uses a local configuration file to define responses to HTTP
 * requests, rather than making actual requests through axios.  This makes it ideal for local
 * micro-frontend development without the associated backend micro-services.
 *
 * @implements {AuthService}
 * @memberof module:Auth
 */

class DevelopmentAuthService extends AbstractAuthService {
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
   * @param {Object} options.config.hydratedAuthenticatedUser
   * @param {Object} options.config.authenticatedUser
   * @param {Object} options.loggingService requires logError and logInfo methods
   */
  constructor(options) {
    super(options);

    PropTypes.checkPropTypes(optionsPropTypes, options, 'options', 'AuthService');

    // Mock user
    const { authenticatedUser, hydratedAuthenticatedUser } = this.config.dev || {};
    this.authenticatedUser = authenticatedUser || null;
    this.hydratedAuthenticatedUser = hydratedAuthenticatedUser || {};

    this.authenticatedHttpClient = this.addConfigResponderToHttpClient(axios.create());
    this.httpClient = this.addConfigResponderToHttpClient(axios.create());
  }

  addConfigResponderToHttpClient(newHttpClient) {
    console.log('add config responder');
    const httpClient = Object.create(newHttpClient);

    const apiConfig = this.config.dev && this.config.dev.apiConfig || {};

    const apiInterceptor = createApiInterceptor({
      apiConfig,
    });

    httpClient.interceptors.request.use(apiInterceptor);

    return httpClient;
  }

  async fetchAuthenticatedUser() {
    return this.getAuthenticatedUser();
  }

  /**
   * Ensures a user is authenticated. It will redirect to login when not authenticated.
   *
   * @param {string} [redirectUrl=config.BASE_URL] to return user after login when not
   * authenticated.
   * @returns {UserData|null} Resolves to the user's access token if they are
   * logged in.
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

  async hydrateAuthenticatedUser() {
    return this.getAuthenticatedUser();
  }
}

export default DevelopmentAuthService;
