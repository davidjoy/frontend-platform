/**
 * #### Import members from **@edx/frontend-platform**
 *
 * The initialization module provides a function for managing an application's initialization
 * lifecycle.  It also provides constants and default handler implementations.
 *
 * ```
 * import {
 *   initialize,
 *   APP_INIT_ERROR,
 *   APP_READY,
 *   subscribe,
 * } from '@edx/frontend-platform';
 * import { AppProvider, ErrorPage, PageRoute } from '@edx/frontend-platform/react';
 * import React from 'react';
 * import ReactDOM from 'react-dom';
 * import { Switch } from 'react-router-dom';
 *
 * subscribe(APP_READY, () => {
 *   ReactDOM.render(
 *     <AppProvider store={configureStore()}>
 *       <Header />
 *       <main>
 *         <Switch>
 *           <PageRoute exact path="/" component={PaymentPage} />
 *         </Switch>
 *       </main>
 *       <Footer />
 *     </AppProvider>,
 *     document.getElementById('root'),
 *   );
 * });
 *
 * subscribe(APP_INIT_ERROR, (error) => {
 *   ReactDOM.render(<ErrorPage message={error.message} />, document.getElementById('root'));
 * });
 *
 * initialize({
 *   messages: [appMessages],
 *   requireAuthenticatedUser: true,
 *   hydrateAuthenticatedUser: true,
 * });

```
 * @module Initialization
 */

import { createBrowserHistory, createMemoryHistory } from 'history';
/*
This 'env.config' package is a special 'magic' alias in our webpack configuration in frontend-build.
It points at an `env.config.js` file in the root of an MFE's repository if it exists and falls back
to an empty object `{}` if the file doesn't exist.  This acts like an 'optional' import, in a sense.
Note that the env.config.js file in frontend-platform's root directory is NOT used by the actual
initialization code, it's just there for the test suite and example application.
*/
import envConfig from 'env.config'; // eslint-disable-line import/no-unresolved

import {
  publish,
} from './pubSub';
// eslint-disable-next-line import/no-cycle
import {
  getConfig, mergeConfig,
} from './config';
import {
  configure as configureLogging, getLoggingService, NewRelicLoggingService, logError,
} from './logging';
import {
  configure as configureAnalytics, SegmentAnalyticsService, identifyAnonymousUser, identifyAuthenticatedUser,
} from './analytics';
import {
  getAuthenticatedHttpClient,
  configure as configureAuth,
  ensureAuthenticatedUser,
  fetchAuthenticatedUser,
  hydrateAuthenticatedUser,
  getAuthenticatedUser,
  AxiosJwtAuthService,
} from './auth';
import { configure as configureI18n } from './i18n';
import {
  APP_PUBSUB_INITIALIZED,
  APP_CONFIG_INITIALIZED,
  APP_AUTH_INITIALIZED,
  APP_I18N_INITIALIZED,
  APP_LOGGING_INITIALIZED,
  APP_ANALYTICS_INITIALIZED,
  APP_READY, APP_INIT_ERROR,
} from './constants';
import configureCache from './auth/LocalForageCache';

/**
 * A browser history or memory history object created by the [history](https://github.com/ReactTraining/history)
 * package.  Applications are encouraged to use this history object, rather than creating their own,
 * as behavior may be undefined when managing history via multiple mechanisms/instances. Note that
 * in environments where browser history may be inaccessible due to `window` being undefined, this
 * falls back to memory history.
 */
export const history = (typeof window !== 'undefined')
  ? createBrowserHistory({
    basename: getConfig().PUBLIC_PATH,
  }) : createMemoryHistory();

/**
 * The default handler for the initialization lifecycle's `initError` phase.  Logs the error to the
 * LoggingService using `logError`
 *
 * @see {@link module:frontend-platform/logging~logError}
 * @param {*} error
 */
export async function initError(error) {
  logError(error);
}

/**
 * The default handler for the initialization lifecycle's `auth` phase.
 *
 * The handler has several responsibilities:
 * - Determining the user's authentication state (authenticated or anonymous)
 * - Optionally redirecting to login if the application requires an authenticated user.
 * - Optionally loading additional user information via the application's user account data
 * endpoint.
 *
 * @param {boolean} requireUser Whether or not we should redirect to login if a user is not
 * authenticated.
 * @param {boolean} hydrateUser Whether or not we should fetch additional user account data.
 */
export async function auth(requireUser, hydrateUser) {
  if (requireUser) {
    await ensureAuthenticatedUser(global.location.href);
  } else {
    await fetchAuthenticatedUser();
  }

  if (hydrateUser && getAuthenticatedUser() !== null) {
    // We intentionally do not await the promise returned by hydrateAuthenticatedUser. All the
    // critical data is returned as part of fetch/ensureAuthenticatedUser above, and anything else
    // is a nice-to-have for application code.
    hydrateAuthenticatedUser();
  }
}

/**
 * Set or overrides configuration via an env.config.js file in the consuming application.
 * This env.config.js is loaded at runtime and must export one of two things:
 *
 * - An object which will be merged into the application config via `mergeConfig`.
 * - A function which returns an object which will be merged into the application config via
 * `mergeConfig`.  This function can return a promise.
 */
async function jsFileConfig() {
  let config = {};
  if (typeof envConfig === 'function') {
    config = await envConfig();
  } else {
    config = envConfig;
  }

  mergeConfig(config);
}

/*
 * Set or overrides configuration through an API.
 * This method allows runtime configuration.
 * Set a basic configuration when an error happen and allow initError and display the ErrorPage.
 */
async function runtimeConfig() {
  try {
    const { MFE_CONFIG_API_URL, APP_ID } = getConfig();

    if (MFE_CONFIG_API_URL) {
      const apiConfig = { headers: { accept: 'application/json' } };
      const apiService = await configureCache();

      const params = new URLSearchParams();
      params.append('mfe', APP_ID);
      const url = `${MFE_CONFIG_API_URL}?${params.toString()}`;

      const { data } = await apiService.get(url, apiConfig);
      mergeConfig(data);
    }
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Error with config API', error.message);
  }
}

/**
 * The default handler for the initialization lifecycle's `analytics` phase.
 *
 * The handler is responsible for identifying authenticated and anonymous users with the analytics
 * service.  This is a pre-requisite for sending analytics events, thus, we do it during the
 * initialization sequence so that analytics is ready once the application's UI code starts to load.
 *
 */
export async function analytics() {
  const authenticatedUser = getAuthenticatedUser();
  if (authenticatedUser && authenticatedUser.userId) {
    identifyAuthenticatedUser(authenticatedUser.userId);
  } else {
    await identifyAnonymousUser();
  }
}

function applyOverrideHandlers(overrides) {
  const noOp = async () => { };
  return {
    pubSub: noOp,
    config: noOp,
    logging: noOp,
    auth,
    analytics,
    i18n: noOp,
    ready: noOp,
    initError,
    ...overrides, // This will override any same-keyed handlers from above.
  };
}

/**
 * Invokes the application initialization sequence.
 *
 * The sequence proceeds through a number of lifecycle phases, during which pertinent services are
 * configured.
 *
 * Using the `handlers` option, lifecycle phase handlers can be overridden to perform custom
 * functionality.  Note that while these override handlers _do_ replace the default handler
 * functionality for analytics, auth, and initError (the other phases have no default
 * functionality), they do _not_ override the configuration of the actual services that those
 * handlers leverage.
 *
 * Some services can be overridden via the loggingService and analyticsService options.  The other
 * services (auth and i18n) cannot currently be overridden.
 *
 * The following lifecycle phases exist:
 *
 * - pubSub: A no-op by default.
 * - config: A no-op by default.
 * - logging: A no-op by default.
 * - auth: Uses the 'auth' handler defined above.
 * - analytics: Uses the 'analytics' handler defined above.
 * - i18n: A no-op by default.
 * - ready: A no-op by default.
 * - initError: Uses the 'initError' handler defined above.
 *
 * @param {Object} [options]
 * @param {*} [options.loggingService=NewRelicLoggingService] The `LoggingService` implementation
 * to use.
 * @param {*} [options.analyticsService=SegmentAnalyticsService] The `AnalyticsService`
 * implementation to use.
 * @param {*} [options.authMiddleware=[]] An array of middleware to apply to http clients in the auth service.
 * @param {*} [options.requireAuthenticatedUser=false] If true, turns on automatic login
 * redirection for unauthenticated users.  Defaults to false, meaning that by default the
 * application will allow anonymous/unauthenticated sessions.
 * @param {*} [options.hydrateAuthenticatedUser=false] If true, makes an API call to the user
 * account endpoint (`${App.config.LMS_BASE_URL}/api/user/v1/accounts/${username}`) to fetch
 * detailed account information for the authenticated user. This data is merged into the return
 * value of `getAuthenticatedUser`, overriding any duplicate keys that already exist. Defaults to
 * false, meaning that no additional account information will be loaded.
 * @param {*} [options.messages] A i18n-compatible messages object, or an array of such objects. If
 * an array is provided, duplicate keys are resolved with the last-one-in winning.
 * @param {*} [options.handlers={}] An optional object of handlers which can be used to replace the
 * default behavior of any part of the startup sequence. It can also be used to add additional
 * initialization behavior before or after the rest of the sequence.
 */
export async function initialize({
  loggingService = NewRelicLoggingService,
  analyticsService = SegmentAnalyticsService,
  authService = AxiosJwtAuthService,
  authMiddleware = [],
  requireAuthenticatedUser: requireUser = false,
  hydrateAuthenticatedUser: hydrateUser = false,
  messages,
  handlers: overrideHandlers = {},
}) {
  const handlers = applyOverrideHandlers(overrideHandlers);
  try {
    // Pub/Sub
    await handlers.pubSub();
    publish(APP_PUBSUB_INITIALIZED);

    // Configuration
    await handlers.config();
    await jsFileConfig();
    await runtimeConfig();
    publish(APP_CONFIG_INITIALIZED);

    // This allows us to replace the implementations of the logging, analytics, and auth services
    // based on keys in the ConfigDocument.  The JavaScript File Configuration method is the only
    // one capable of supplying an alternate implementation since it can import other modules.
    // If a service wasn't supplied we fall back to the default parameters on the initialize
    // function signature.
    const loggingServiceImpl = getConfig().loggingService || loggingService;
    const analyticsServiceImpl = getConfig().analyticsService || analyticsService;
    const authServiceImpl = getConfig().authService || authService;

    // Logging
    configureLogging(loggingServiceImpl, {
      config: getConfig(),
    });
    await handlers.logging();
    publish(APP_LOGGING_INITIALIZED);

    // Authentication
    configureAuth(authServiceImpl, {
      loggingService: getLoggingService(),
      config: getConfig(),
      middleware: authMiddleware,
    });

    await handlers.auth(requireUser, hydrateUser);
    publish(APP_AUTH_INITIALIZED);

    // Analytics
    configureAnalytics(analyticsServiceImpl, {
      config: getConfig(),
      loggingService: getLoggingService(),
      httpClient: getAuthenticatedHttpClient(),
    });
    await handlers.analytics();
    publish(APP_ANALYTICS_INITIALIZED);

    // Internationalization
    configureI18n({
      messages,
      config: getConfig(),
      loggingService: getLoggingService(),
    });
    await handlers.i18n();
    publish(APP_I18N_INITIALIZED);

    // Application Ready
    await handlers.ready();
    publish(APP_READY);
  } catch (error) {
    if (!error.isRedirecting) {
      // Initialization Error
      await handlers.initError(error);
      publish(APP_INIT_ERROR, error);
    }
  }
}
