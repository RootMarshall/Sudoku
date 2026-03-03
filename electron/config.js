/**
 * AWS Cognito and API Gateway configuration.
 * Update these values after creating resources in the AWS Console.
 */
module.exports = {
  cognito: {
    region: 'us-west-2',
    userPoolId: 'us-west-2_e1T527vxO',
    /** Public app client ID (no secret) - create in Cognito > App clients */
    clientId: '5mhi5n45ilivvpocgp1rlsog5g',
    /** Cognito domain prefix, e.g. sudoku-game from sudoku-game.auth.us-west-2.amazoncognito.com */
    domain: 'us-west-2e1t527vxo',
  },
  api: {
    /** API Gateway REST API base URL, e.g. https://abc123.execute-api.us-west-2.amazonaws.com/prod */
    baseUrl: 'https://2thfjtd5mh.execute-api.us-west-2.amazonaws.com/dev/standard',
  },
};
