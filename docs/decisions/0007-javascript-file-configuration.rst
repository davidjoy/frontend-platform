Promote JavaScript file configuration and deprecate environment variable configuration
======================================================================================

Status
------

Draft

Context
-------

Our webpack build process allows us to set environment variables on the command line or via .env
files.  These environment variables are available in the application via ``process.env``.

The implementation of this uses templatization and string interpolation to replace any instance of
``process.env.XXXX`` with the value of the environment variable named ``XXXX``.  As an example, in our
source code we may write::

    const LMS_BASE_URL = process.env.LMS_BASE_URL;

After the build process runs, the compiled source code will instead read::

    const LMS_BASE_URL = 'http://localhost:18000';

Put another way, `process.env` is not actually an object available at runtime, it's a templatization
token that helps the build replace it with a string literal.

This approach has several important limitations:

- There's no way to add variables without hard-coding process.env.XXXX somewhere in the file,
  complicating our ability to add additional application-specific configuration without explicitly
  merging it into the configuration document after it's been created in frontend-platform.
- The method can *only* handle strings.

  Other data types are converted to strings::

    # Build command:
    BOOLEAN_VAR=false NULL_VAR=null NUMBER_VAR=123 npm run build

    ...

    // Source code:
    const BOOLEAN_VAR = process.env.BOOLEAN_VAR;
    const NULL_VAR = process.env.NULL_VAR;
    const NUMBER_VAR = process.env.NUMBER_VAR;

    ...

    // Compiled source after the build runs:
    const BOOLEAN_VAR = "false";
    const NULL_VAR = "null";
    const NUMBER_VAR = "123";

  This is not good!

- It makes it very difficult to supply array and object configuration variables, and unreasonable to
  supply class or function config since we'd have to ``eval()`` them.

Related to all this, frontend-platform has long had the ability to replace the implementations of
its analytics, auth, and logging services, but no way to actually *configure* the app with a new
implementation.  Because of the above limitations, there's no reasonable way to configure a
JavaScript class via environment variables.

Decision
--------

For the above reasons, we will deprecate environment variable configuration in favor of JavaScript
file configuration.

This method makes use of an ``env.config.js`` file to supply configuration variables to an application::

    const config = {
      LMS_BASE_URL: 'http://localhost:18000',
      BOOLEAN_VAR: false,
      NULL_VAR: null,
      NUMBER_VAR: 123
    };

    export default config;

This file is imported by the frontend-build webpack build process if it exists, and expected by
frontend-platform as part of its initialization process. If the file doesn't exist, frontend-build
falls back to importing an empty object for backwards compatibility.  This functionality already exists
today in frontend-build in preparation for using it here in frontend-platform.

This interdependency creates a peerDependency for frontend-platform on `frontend-build v8.1.0 <frontend_build_810_>`_ or
later.

Using a JavaScript file for configuration is standard practice in the JavaScript/node community.
Babel, webpack, eslint, Jest, etc., all accept configuration via JavaScript files (which we take
advantage of in frontend-build), so there is ample precedent for using a .js file for configuration.

In order to achieve deprecation of environment variable configuration, we will follow the
deprecation process described in `OEP-21: Deprecation and Removal <oep21_>`_.  In addition, we will
add build-time warnings to frontend-build indicating the deprecation of environment
variable configuration.  Practically speaking, this will mean adjusting build processes throughout
the community and in common tools like Tutor.

Rejected Alternatives
---------------------

Another option was to use JSON files for this purpose.  This solves some of our issues (limited use
of non-string primitive data types) but is otherwise not nearly as expressive for flexible as using
a JavaScript file directly.  Anecdotally, in the past frontend-build used JSON versions of many of
its configuration files (Babel, eslint, jest) but over time they were all converted to JavaScript
files so we could express more complicated configuration needs.  Since one of the primary use cases
and reasons we need a new configuration method is to allow developers to supply alternate implementations
of frontend-platform's core services (analytics, logging), JSON was a effectively a non-starter.

.. _oep21: https://docs.openedx.org/projects/openedx-proposals/en/latest/processes/oep-0021-proc-deprecation.html
.. _frontend_build_810: https://github.com/openedx/frontend-build/releases/tag/v8.1.0
