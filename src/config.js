/**
 * #### Import members from **@edx/frontend-platform**
 *
 * The configuration module provides utilities for working with an application's configuration
 * document (ConfigDocument).  Configuration environment variables can be supplied to the
 * application in four different ways:
 *
 * ##### Build-time Environment Variables
 *
 * A set list of required config variables can be supplied as
 * command-line environment variables during the build process.
 *
 * As a simple example, these are supplied on the command-line before invoking `npm run build`:
 *
 * ```
 * LMS_BASE_URL=http://localhost:18000 npm run build
 * ```
 *
 * Note that additional variables _cannot_ be supplied via this method without using the `config`
 * initialization handler.  The app won't pick them up and they'll appear `undefined`.
 *
 * ##### JavaScript File Configuration
 *
 * Configuration variables can be supplied in an optional file
 * named env.config.js.  This file must export either an Object containing configuration variables
 * or a function.  The function must return an Object containing configuration variables or,
 * alternately, a promise which resolves to an Object.
 *
 * Exporting a config object:
 * ```
 * const config = {
 *   LMS_BASE_URL: 'http://localhost:18000'
 * };
 *
 * export default config;
 * ```
 *
 * Exporting a function that returns an object:
 * ```
 * function getConfig() {
 *   return {
 *     LMS_BASE_URL: 'http://localhost:18000'
 *   };
 * }
 * ```
 *
 * Exporting a function that returns a promise that resolves to an object:
 * ```
 * function getAsyncConfig() {
 *   return new Promise((resolve, reject) => {
 *     resolve({
 *       LMS_BASE_URL: 'http://localhost:18000'
 *     });
 *   });
 * }
 *
 * export default getAsyncConfig;
 * ```
 *
 * ##### Runtime Configuration
 *
 * Configuration variables can also be supplied using the "runtime
 * configuration" method, taking advantage of the Micro-frontend Config API in edx-platform.
 * More information on this API can be found in the ADR which introduced it:
 *
 * https://github.com/openedx/edx-platform/blob/master/lms/djangoapps/mfe_config_api/docs/decisions/0001-mfe-config-api.rst
 *
 * The runtime configuration method can be enabled by supplying a MFE_CONFIG_API_URL via one of the other
 * two configuration methods above.
 *
 * ##### Initialization Config Handler
 *
 * The configuration document can be extended by
 * applications at run-time using a `config` initialization handler.  Please see the Initialization
 * documentation for more information on handlers and initialization phases.
 *
 * ```
 * initialize({
 *   handlers: {
 *     config: () => {
 *       mergeConfig({
 *         CUSTOM_VARIABLE: 'custom value',
 *         LMS_BASE_URL: 'http://localhost:18001' // You can override variables, but this is uncommon.
  *       }, 'App config override handler');
 *     },
 *   },
 * });
 * ```
 *
 * @module Config
 */

import { APP_CONFIG_INITIALIZED, CONFIG_CHANGED } from './constants';

import { publish, subscribe } from './pubSub';
import { ensureDefinedConfig } from './utils';

function extractRegex(envVar) {
  // Convert the environment variable string to a regex, while guarding
  // against a non-string and an empty/whitespace-only string.
  if (typeof envVar === 'string' && envVar.trim() !== '') {
    return new RegExp(envVar);
  }
  return undefined;
}

const ENVIRONMENT = process.env.NODE_ENV;
let config = {
  ACCESS_TOKEN_COOKIE_NAME: process.env.ACCESS_TOKEN_COOKIE_NAME,
  ACCOUNT_PROFILE_URL: process.env.ACCOUNT_PROFILE_URL,
  ACCOUNT_SETTINGS_URL: process.env.ACCOUNT_SETTINGS_URL,
  BASE_URL: process.env.BASE_URL,
  PUBLIC_PATH: process.env.PUBLIC_PATH || '/',
  CREDENTIALS_BASE_URL: process.env.CREDENTIALS_BASE_URL,
  CSRF_TOKEN_API_PATH: process.env.CSRF_TOKEN_API_PATH,
  DISCOVERY_API_BASE_URL: process.env.DISCOVERY_API_BASE_URL,
  PUBLISHER_BASE_URL: process.env.PUBLISHER_BASE_URL,
  ECOMMERCE_BASE_URL: process.env.ECOMMERCE_BASE_URL,
  ENVIRONMENT,
  IGNORED_ERROR_REGEX: extractRegex(process.env.IGNORED_ERROR_REGEX),
  LANGUAGE_PREFERENCE_COOKIE_NAME: process.env.LANGUAGE_PREFERENCE_COOKIE_NAME,
  LEARNING_BASE_URL: process.env.LEARNING_BASE_URL,
  LMS_BASE_URL: process.env.LMS_BASE_URL,
  LOGIN_URL: process.env.LOGIN_URL,
  LOGOUT_URL: process.env.LOGOUT_URL,
  STUDIO_BASE_URL: process.env.STUDIO_BASE_URL,
  MARKETING_SITE_BASE_URL: process.env.MARKETING_SITE_BASE_URL,
  ORDER_HISTORY_URL: process.env.ORDER_HISTORY_URL,
  REFRESH_ACCESS_TOKEN_ENDPOINT: process.env.REFRESH_ACCESS_TOKEN_ENDPOINT,
  SECURE_COOKIES: ENVIRONMENT !== 'development',
  SEGMENT_KEY: process.env.SEGMENT_KEY,
  SITE_NAME: process.env.SITE_NAME,
  USER_INFO_COOKIE_NAME: process.env.USER_INFO_COOKIE_NAME,
  LOGO_URL: process.env.LOGO_URL,
  LOGO_TRADEMARK_URL: process.env.LOGO_TRADEMARK_URL,
  LOGO_WHITE_URL: process.env.LOGO_WHITE_URL,
  FAVICON_URL: process.env.FAVICON_URL,
  MFE_CONFIG_API_URL: process.env.MFE_CONFIG_API_URL,
  APP_ID: process.env.APP_ID,
  SUPPORT_URL: process.env.SUPPORT_URL,
};

/**
 * Getter for the application configuration document.  This is synchronous and merely returns a
 * reference to an existing object, and is thus safe to call as often as desired.
 *
 * Example:
 *
 * ```
 * import { getConfig } from '@edx/frontend-platform';
 *
 * const {
 *   LMS_BASE_URL,
 * } = getConfig();
 * ```
 *
 * @returns {ConfigDocument}
  */
export function getConfig() {
  return config;
}

/**
 * Replaces the existing ConfigDocument.  This is not commonly used, but can be helpful for tests.
 *
 * The supplied config document will be tested with `ensureDefinedConfig` to ensure it does not
 * have any `undefined` keys.
 *
 * Example:
 *
 * ```
 * import { setConfig } from '@edx/frontend-platform';
 *
 * setConfig({
 *   LMS_BASE_URL, // This is overriding the ENTIRE document - this is not merged in!
 * });
 * ```
 *
 * @param {ConfigDocument} newConfig
 */
export function setConfig(newConfig) {
  ensureDefinedConfig(config, 'config');
  config = newConfig;
  publish(CONFIG_CHANGED);
}

/**
 * Merges additional configuration values into the ConfigDocument returned by `getConfig`.  Will
 * override any values that exist with the same keys.
 *
 * ```
 * mergeConfig({
 *   NEW_KEY: 'new value',
 *   OTHER_NEW_KEY: 'other new value',
 * });
 *
 * If any of the key values are `undefined`, an error will be logged to 'warn'.
 *
 * @param {Object} newConfig
 */
export function mergeConfig(newConfig) {
  ensureDefinedConfig(newConfig, 'ProcessEnvConfigService');
  config = Object.assign(config, newConfig);
  publish(CONFIG_CHANGED);
}

/**
 * A method allowing application code to indicate that particular ConfigDocument keys are required
 * for them to function.  This is useful for diagnosing development/deployment issues, primarily,
 * by surfacing misconfigurations early.  For instance, if the build process fails to supply an
 * environment variable on the command-line, it's possible that one of the `process.env` variables
 * will be undefined.  Should be used in conjunction with `mergeConfig` for custom `ConfigDocument`
 * properties.  Requester is for informational/error reporting purposes only.
 *
 * ```
 * ensureConfig(['LMS_BASE_URL', 'LOGIN_URL'], 'MySpecialComponent');
 *
 * // Will log a warning with:
 * // "App configuration error: LOGIN_URL is required by MySpecialComponent."
 * // if LOGIN_URL is undefined, for example.
 * ```
 *
 * *NOTE*: `ensureConfig` waits until `APP_CONFIG_INITIALIZED` is published to verify the existence
 * of the specified properties.  This means that this function is compatible with custom `config`
 * phase handlers responsible for loading additional configuration data in the initialization
 * sequence.
 *
 * @param {Array} keys
 * @param {string} [requester='unspecified application code']
 */
export function ensureConfig(keys, requester = 'unspecified application code') {
  subscribe(APP_CONFIG_INITIALIZED, () => {
    keys.forEach((key) => {
      if (config[key] === undefined) {
        // eslint-disable-next-line no-console
        console.warn(`App configuration error: ${key} is required by ${requester}.`);
      }
    });
  });
}

/**
 * An object describing the current application configuration.
 *
 * In its most basic form, the initialization process loads this document via `process.env`
 * variables.  There are other ways to add configuration variables to the ConfigDocument as
 * documented above (JavaScript File Configuration, Runtime Configuration, and the Initialization
 * Config Handler)
 *
 * ```
 * {
 *   BASE_URL: process.env.BASE_URL,
 *   // ... other vars
 * }
 * ```
 *
 * When using Webpack (i.e., normal usage), the build process is responsible for supplying these
 * variables via command-line environment variables.  That means they must be supplied at build
 * time.
 *
 * @name ConfigDocument
 * @memberof module:Config
 * @property {string} ACCESS_TOKEN_COOKIE_NAME
 * @property {string} ACCOUNT_PROFILE_URL
 * @property {string} ACCOUNT_SETTINGS_URL
 * @property {string} BASE_URL The URL of the current application.
 * @property {string} CREDENTIALS_BASE_URL
 * @property {string} CSRF_TOKEN_API_PATH
 * @property {string} DISCOVERY_API_BASE_URL
 * @property {string} PUBLISHER_BASE_URL
 * @property {string} ECOMMERCE_BASE_URL
 * @property {string} ENVIRONMENT This is one of: development, production, or test.
 * @property {string} IGNORED_ERROR_REGEX
 * @property {string} LANGUAGE_PREFERENCE_COOKIE_NAME
 * @property {string} LEARNING_BASE_URL
 * @property {string} LMS_BASE_URL
 * @property {string} LOGIN_URL
 * @property {string} LOGOUT_URL
 * @property {string} STUDIO_BASE_URL
 * @property {string} MARKETING_SITE_BASE_URL
 * @property {string} ORDER_HISTORY_URL
 * @property {string} REFRESH_ACCESS_TOKEN_ENDPOINT
 * @property {boolean} SECURE_COOKIES
 * @property {string} SEGMENT_KEY
 * @property {string} SITE_NAME
 * @property {string} USER_INFO_COOKIE_NAME
 * @property {string} LOGO_URL
 * @property {string} LOGO_TRADEMARK_URL
 * @property {string} LOGO_WHITE_URL
 * @property {string} FAVICON_URL
 * @property {string} MFE_CONFIG_API_URL
 * @property {string} APP_ID
 * @property {string} SUPPORT_URL
 */
