import { Amplify } from 'aws-amplify';

// Calcified: configure Amplify and leave storage at the default (localStorage).
// No call to cognitoUserPoolsTokenProvider.setKeyValueStorage anywhere in this app.
Amplify.configure({
  Auth: {
    Cognito: {
      userPoolId: 'us-east-1_EXAMPLE',
      userPoolClientId: 'exampleClientId',
    },
  },
});
