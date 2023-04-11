import React, { Component } from 'react';
import { Link } from 'react-router-dom';

import { injectIntl, intlShape } from '@edx/frontend-platform/i18n';
import { logInfo } from '@edx/frontend-platform/logging';
import { AppContext } from '@edx/frontend-platform/react';
import { ensureConfig, mergeConfig, getConfig } from '@edx/frontend-platform';
import messages from './messages';

mergeConfig({
  EXAMPLE_VAR: process.env.EXAMPLE_VAR,
});

ensureConfig([
  'EXAMPLE_VAR',
  'JS_FILE_VAR',
], 'ExamplePage');

class ExamplePage extends Component {
  constructor(props, context) {
    super(props, context);

    logInfo('The example page can log info, which means logging is configured correctly.');
  }

  renderAuthenticatedUser() {
    if (this.context.authenticatedUser === null) {
      return null;
    }
    return (
      <div>
        <p>Authenticated Username: <strong>{this.context.authenticatedUser.username}</strong></p>
        <p>
          Authenticated user&apos;s name:
          <strong>{this.context.authenticatedUser.name}</strong>
          (Only available if user account has been fetched)
        </p>
      </div>
    );
  }

  render() {
    return (
      <div>
        <h1>{this.context.config.SITE_NAME} example page.</h1>
        <p>{this.props.intl.formatMessage(messages['example.message'])}</p>
        {this.renderAuthenticatedUser()}
        <p>EXAMPLE_VAR env var came through: <strong>{getConfig().EXAMPLE_VAR}</strong></p>
        <p>JS_FILE_VAR var came through: <strong>{getConfig().JS_FILE_VAR}</strong></p>
        <p>Visit <Link to="/authenticated">authenticated page</Link>.</p>
        <p>Visit <Link to="/error_example">error page</Link>.</p>
      </div>
    );
  }
}

ExamplePage.contextType = AppContext;

ExamplePage.propTypes = {
  intl: intlShape.isRequired,
};

export default injectIntl(ExamplePage);
