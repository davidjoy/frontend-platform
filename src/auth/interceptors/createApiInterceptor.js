const createApiInterceptor = (options) => {
  const { apiConfig } = options;

  // Creating the interceptor inside this closure to
  // maintain reference to the options supplied.
  const interceptor = async (axiosRequestConfig) => {
    const mockApiId = axiosRequestConfig.mockApiId;

    if (apiConfig[mockApiId] === undefined) {
      console.log('could not find mockApiId for: ', axiosRequestConfig);
      return axiosRequestConfig;
    }

    const callConfig = apiConfig[mockApiId];

    axiosRequestConfig.adapter = function(config) {
      return new Promise((resolve, reject) => {
        var response = {
          data: {},
          status: 200,
          statusText: 'OK',
          headers: {"content-type": "application/json"},
          config,
          request: {},
          ...callConfig,
        };
        return resolve(response);
      })
    }

    return axiosRequestConfig;
  };

  return interceptor;
};

export default createApiInterceptor;
