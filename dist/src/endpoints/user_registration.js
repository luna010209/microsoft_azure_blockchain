import { typedKv } from '../node_modules/@microsoft/ccf-app/kv.js';
import { string } from '../node_modules/@microsoft/ccf-app/converters.js';
import '../node_modules/@microsoft/ccf-app/consensus.js';
import '../node_modules/@microsoft/ccf-app/historical.js';
import '../node_modules/@microsoft/ccf-app/endpoints.js';
import { MAP_PREFIX, errorResponse } from './common.js';

const userPolicies = typedKv(MAP_PREFIX + "userPolicy", string, string);
function getPolicy(user_fingerprint) {
    return userPolicies.get(user_fingerprint);
}
function getUserPolicy(request) {
    const callerId = acl.certUtils.convertToAclFingerprintFormat();
    if (!userPolicies.has(callerId)) {
        return errorResponse(400, "No policy found");
    }
    return {
        statusCode: 200,
        body: userPolicies.get(callerId),
    };
}
function setUserPolicy(request) {
    const callerId = acl.certUtils.convertToAclFingerprintFormat();
    const actionPermitted = acl.authz.actionAllowed(callerId, "/policy/write");
    if (!actionPermitted) {
        return errorResponse(403, `${callerId} is not authorized to set an insurance policy.`);
    }
    try {
        var { cert, policy } = request.body.json();
        if (!cert || typeof cert !== "string") {
            return errorResponse(400, "Missing or invalid user certificate.");
        }
        if (!policy || typeof policy !== "string") {
            return errorResponse(400, "Missing or invalid policy.");
        }
    }
    catch (error) {
        return errorResponse(400, "Failed while parsing body: " + error.message);
    }
    userPolicies.set(cert, policy);
    return {
        statusCode: 200,
    };
}

export { getPolicy, getUserPolicy, setUserPolicy };
