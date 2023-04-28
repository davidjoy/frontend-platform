import formurlencoded from 'form-urlencoded';
import { snakeCaseObject } from '../utils';

/**
 * @implements {AnalyticsService}
 * @memberof module:Analytics
 */
class SegmentAnalyticsService {
  constructor({ httpClient, loggingService, config }) {
    this.loggingService = loggingService;
    this.httpClient = httpClient;
    this.trackingLogApiUrl = `${config.LMS_BASE_URL}/event`;
    this.segmentKey = config.SEGMENT_KEY;
    this.hasIdentifyBeenCalled = false;
    this.segmentInitialized = false;

    if (this.segmentKey) {
      this.initializeSegment();
    }
  }

  // The code in this function is from Segment's website, with a few updates:
  // - It uses the segmentKey from the SegmentAnalyticsService instance.
  // - It also saves a "segmentInitialized" variable on the SegmentAnalyticsService instance so
  //   that the service can keep track of its own initialization state.
  // Reference:
  // https://segment.com/docs/connections/sources/catalog/libraries/website/javascript/quickstart/
  initializeSegment() {
    // Create a queue, but don't obliterate an existing one!
    global.analytics = global.analytics || [];
    const { analytics } = global;

    // If the real analytics.js is already on the page return.
    if (analytics.initialize) {
      this.segmentInitialized = true;
      return;
    }

    // If the snippet was invoked do nothing.
    if (analytics.invoked) {
      this.segmentInitialized = true;
      return;
    }

    // Invoked flag, to make sure the snippet
    // is never invoked twice.
    analytics.invoked = true;

    // A list of the methods in Analytics.js to stub.
    analytics.methods = [
      'trackSubmit',
      'trackClick',
      'trackLink',
      'trackForm',
      'pageview',
      'identify',
      'reset',
      'group',
      'track',
      'ready',
      'alias',
      'debug',
      'page',
      'once',
      'off',
      'on',
    ];

    // Define a factory to create stubs. These are placeholders
    // for methods in Analytics.js so that you never have to wait
    // for it to load to actually record data. The `method` is
    // stored as the first argument, so we can replay the data.
    analytics.factory = method => ((...args) => {
      args.unshift(method);
      analytics.push(args);
      return analytics;
    });

    // For each of our methods, generate a queueing stub.
    analytics.methods.forEach((key) => {
      analytics[key] = analytics.factory(key);
    });

    // Define a method to load Analytics.js from our CDN,
    // and that will be sure to only ever load it once.
    analytics.load = (key, options) => {
      // Create an async script element based on your key.
      const script = document.createElement('script');
      script.type = 'text/javascript';
      script.onerror = () => {
        this.segmentInitialized = false;
        const event = new Event('segmentFailed');
        document.dispatchEvent(event);
      };
      script.async = true;
      script.src = `https://cdn.segment.com/analytics.js/v1/${key}/analytics.min.js`;

      // Insert our script next to the first script element.
      const first = document.getElementsByTagName('script')[0];
      first.parentNode.insertBefore(script, first);
      analytics._loadOptions = options; // eslint-disable-line no-underscore-dangle

      this.segmentInitialized = true;
    };

    // Add a version to keep track of what's in the wild.
    analytics.SNIPPET_VERSION = '4.1.0';

    // Load Analytics.js with your key, which will automatically
    // load the tools you've enabled for your account. Boosh!
    analytics.load(this.segmentKey);
  }

  /**
   * Checks that identify was first called.  Otherwise, logs error.
   *
   */
  checkIdentifyCalled() {
    if (!this.hasIdentifyBeenCalled) {
      this.loggingService.logError('Identify must be called before other tracking events.');
    }
  }

  /**
   * Logs events to tracking log and downstream.
   * For tracking log event documentation, see
   * https://openedx.atlassian.net/wiki/spaces/AN/pages/13205895/Event+Design+and+Review+Process
   *
   * @param {string} eventName (event_type on backend, but named to match Segment api)
   * @param {Object} properties (event on backend, but named properties to match Segment api)
   * @returns {Promise} The promise returned by HttpClient.post.
   */
  sendTrackingLogEvent(eventName, properties) {
    const snakeEventData = snakeCaseObject(properties, { deep: true });
    const serverData = {
      event_type: eventName,
      event: JSON.stringify(snakeEventData),
      page: global.location.href,
    };
    return this.httpClient.post(
      this.trackingLogApiUrl,
      formurlencoded(serverData),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        mockApiId: eventName
      },
    ).catch((error) => {
      this.loggingService.logError(error);
    });
  }

  /**
   * * Send identify call to Segment.
   *
   * @param {string} userId
   * @param {*} [traits]
   */
  identifyAuthenticatedUser(userId, traits) {
    if (!userId) {
      throw new Error('UserId is required for identifyAuthenticatedUser.');
    }

    if (!this.segmentInitialized) {
      return;
    }
    global.analytics.identify(userId, traits);
    this.hasIdentifyBeenCalled = true;
  }

  /**
   * Send anonymous identify call to Segment's identify.
   *
   * @param {*} [traits]
   * @returns {Promise} Promise that will resolve once the document readyState is complete
   */
  identifyAnonymousUser(traits) { // eslint-disable-line no-unused-vars
    if (!this.segmentInitialized) {
      return Promise.resolve();
    }
    // if we do not have an authenticated user (indicated by being in this method),
    // but we still have a user id associated in segment, reset the local segment state
    // This has to be wrapped in the analytics.ready() callback because the analytics.user()
    // function isn't available until the analytics.js package has finished initializing.
    return new Promise((resolve, reject) => { // eslint-disable-line no-unused-vars
      global.analytics.ready(() => {
        if (global.analytics.user().id()) {
          global.analytics.reset();
        }
        // We don’t need to call `identify` for anonymous users and can just make the value of
        // hasIdentifyBeenCalled true. Segment automatically assigns them an anonymousId, so
        // just calling `page` and `track` works fine without identify.
        this.hasIdentifyBeenCalled = true;
        resolve();
      });

      // this is added to handle a specific use-case where if a user has blocked the analytics
      // tools in their browser, this promise does not get resolved and user sees a blank
      // page. Dispatching this event in script.onerror callback in analytics.load.
      document.addEventListener('segmentFailed', resolve);
      // This is added to handle the google analytics blocked case which is injected into
      // the DOM by segment.min.js.
      setTimeout(() => {
        if (!global.ga || !global.ga.create || !global.google_tag_manager) {
          this.segmentInitialized = false;
          resolve();
        }
      }, 2000);
    });
  }

  /**
   * Sends a track event to Segment and downstream.
   * Note: For links and forms, you should use trackLink and trackForm instead.
   *
   * @param {*} eventName
   * @param {*} [properties]
   */
  sendTrackEvent(eventName, properties) {
    if (!this.segmentInitialized) {
      return;
    }
    this.checkIdentifyCalled();
    global.analytics.track(eventName, properties);
  }

  /**
   * Sends a page event to Segment and downstream.
   *
   * @param {*} [name] If only one string arg provided, assumed to be name.
   * @param {*} [category] Name is required to pass a category.
   * @param {*} [properties]
   */
  sendPageEvent(category, name, properties) {
    if (!this.segmentInitialized) {
      return;
    }
    this.checkIdentifyCalled();
    global.analytics.page(category, name, properties);
  }
}

export default SegmentAnalyticsService;
