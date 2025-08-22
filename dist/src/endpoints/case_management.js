import { typedKv } from '../node_modules/@microsoft/ccf-app/kv.js';
import { int32, arrayBuffer, json } from '../node_modules/@microsoft/ccf-app/converters.js';
import '../node_modules/@microsoft/ccf-app/consensus.js';
import '../node_modules/@microsoft/ccf-app/historical.js';
import '../node_modules/@microsoft/ccf-app/endpoints.js';
import { MAP_PREFIX, SINGLETON_KEY } from './common.js';
import { isValidProcessor } from './processor_registration.js';
import { getPolicy } from './user_registration.js';

const kvCaseId = typedKv(MAP_PREFIX + "caseId", arrayBuffer, int32);
const kvCases = typedKv("caseMetadata", int32, json());
const kvCaseQueue = typedKv(MAP_PREFIX + "caseQueue", arrayBuffer, json());
function getCaseQueue() {
    if (!kvCaseQueue.has(SINGLETON_KEY)) {
        kvCaseQueue.set(SINGLETON_KEY, []);
    }
    return kvCaseQueue.get(SINGLETON_KEY);
}
function registerCase(request) {
    let incident = request.body.text();
    const callerId = acl.certUtils.convertToAclFingerprintFormat();
    const policy = getPolicy(callerId);
    if (policy === undefined) {
        return { statusCode: 404, body: "No policy found for this user" };
    }
    var case_id_int = kvCaseId.get(SINGLETON_KEY);
    if (case_id_int === undefined) {
        case_id_int = 0;
    }
    kvCaseId.set(SINGLETON_KEY, case_id_int + 1);
    const case_id = case_id_int;
    kvCases.set(case_id, {
        incident,
        policy,
        decision: {
            decision: "",
            processor_fingerprint: "",
        },
    });
    let caseQueue = getCaseQueue();
    caseQueue.push(case_id);
    kvCaseQueue.set(SINGLETON_KEY, caseQueue);
    return {
        statusCode: 200,
        body: String(case_id),
    };
}
function nextCase(request) {
    let caseQueue = getCaseQueue();
    if (caseQueue.length <= 0) {
        return {
            statusCode: 404,
            body: "No cases found",
        };
    }
    let case_id = caseQueue.shift();
    caseQueue.push(case_id);
    kvCaseQueue.set(SINGLETON_KEY, caseQueue);
    if (!kvCases.has(case_id)) {
        return {
            statusCode: 500,
            body: `Case ${case_id} in case queue but not in store.`,
        };
    }
    return {
        statusCode: 200,
        body: { caseId: case_id, metadata: kvCases.get(case_id) },
    };
}
function getCaseMetadata(request) {
    try {
        const caseIdParam = request.params["caseId"];
        if (!caseIdParam || typeof caseIdParam !== "string") {
            return {
                statusCode: 400,
                body: "Missing or invalid caseId in parameters.",
            };
        }
        var caseId = Number(caseIdParam);
    }
    catch (error) {
        return {
            statusCode: 400,
            body: "Exception while parsing request: " + error.message,
        };
    }
    const caseMetadata = kvCases.get(caseId);
    if (!caseMetadata) {
        return { statusCode: 404, body: "Case not found" };
    }
    return {
        statusCode: 200,
        body: {
            metadata: caseMetadata,
            version: kvCases.getVersionOfPreviousWrite(caseId),
        },
    };
}
function putCaseDecision(request) {
    try {
        const caseIdParam = request.params["caseId"];
        if (!caseIdParam || typeof caseIdParam !== "string") {
            return {
                statusCode: 400,
                body: "Missing or invalid caseId in parameters.",
            };
        }
        var caseId = Number(caseIdParam);
        var { incident, policy, decision } = request.body.json();
        if (!incident || typeof incident !== "string") {
            return { statusCode: 400, body: "Missing or invalid incident" };
        }
        if (!policy || typeof policy !== "string") {
            return { statusCode: 400, body: "Missing or invalid policy" };
        }
        const possible_decisions = new Set(["approve", "deny", "error"]);
        if (!decision ||
            typeof decision !== "string" ||
            !possible_decisions.has(decision)) {
            return { statusCode: 400, body: "Missing or invalid decision" };
        }
    }
    catch (error) {
        return {
            statusCode: 400,
            body: "Exception while parsing request: " + error.message,
        };
    }
    let caseMetadata = kvCases.get(caseId);
    if (!caseMetadata) {
        return { statusCode: 404, body: "Case not found" };
    }
    if (caseMetadata.decision.decision !== "") {
        return { statusCode: 400, body: "Already stored decision for case." };
    }
    if (caseMetadata.incident !== incident || caseMetadata.policy !== policy) {
        return {
            statusCode: 400,
            body: "Expected case metadata does not match processed metadata",
        };
    }
    const callerId = acl.certUtils.convertToAclFingerprintFormat();
    if (!isValidProcessor(callerId)) {
        return { statusCode: 403, body: "Invalid processor" };
    }
    kvCases.set(caseId, {
        ...caseMetadata,
        decision: { decision, processor_fingerprint: callerId },
    });
    let queue = getCaseQueue();
    let filtered_queue = queue.filter((val, idx, arr) => val != caseId);
    kvCaseQueue.set(SINGLETON_KEY, filtered_queue);
    return { statusCode: 200 };
}

export { getCaseMetadata, nextCase, putCaseDecision, registerCase };
