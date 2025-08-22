import { typedKv } from '../node_modules/@microsoft/ccf-app/kv.js';
import { json, arrayBuffer, string, typedArray } from '../node_modules/@microsoft/ccf-app/converters.js';
import '../node_modules/@microsoft/ccf-app/consensus.js';
import '../node_modules/@microsoft/ccf-app/historical.js';
import '../node_modules/@microsoft/ccf-app/endpoints.js';
import { MAP_PREFIX, SINGLETON_KEY, equal_uint8array } from './common.js';
import { Base64 as gBase64 } from '../node_modules/js-base64/base64.mjs.js';
import { snp_attestation, ccf } from '../node_modules/@microsoft/ccf-app/global.js';

const validProcessorPolicy = typedKv(MAP_PREFIX + "validProcessorProperties", arrayBuffer, json());
const processors = typedKv(MAP_PREFIX + "validProcessors", string, json());
function isValidProcessor(processor_cert_fingerprint) {
    let metadata = processors.get(processor_cert_fingerprint);
    try {
        validateProcessorMetadata(metadata);
    }
    catch (error) {
        return false;
    }
    return true;
}
function getProcessorMetadata(processor_cert_fingerprint) {
    return processors.get(processor_cert_fingerprint);
}
function validateProcessorMetadata(properties) {
    let valid_policies = validProcessorPolicy.get(SINGLETON_KEY);
    if (!valid_policies.includes(properties.policy)) {
        throw new Error("UVM's policy is invalid.");
    }
}
function setValidProcessorPolicy(request) {
    const callerId = acl.certUtils.convertToAclFingerprintFormat();
    const actionPermitted = acl.authz.actionAllowed(callerId, "/processor/write");
    if (!actionPermitted) {
        return {
            statusCode: 403,
            body: `${callerId} is not authorized to set uvm endorsements.`,
        };
    }
    try {
        var { policies } = request.body.json();
        if (!policies ||
            !Array.isArray(policies) ||
            !policies.every((item) => typeof item === "string")) {
            return { statusCode: 400, body: "Missing or invalid policies" };
        }
    }
    catch (error) {
        return {
            statusCode: 400,
            body: "Error while parsing policy: " + error.message,
        };
    }
    validProcessorPolicy.set(SINGLETON_KEY, policies);
    return { statusCode: 200 };
}
function getValidProcessorPolicy(request) {
    return {
        statusCode: 200,
        body: validProcessorPolicy.get(SINGLETON_KEY),
    };
}
function registerProcessor(request) {
    let bytes_attestation;
    let bytes_platform_certificates;
    let bytes_uvm_endorsements;
    try {
        let { attestation, platform_certificates, uvm_endorsements } = request.body.json();
        if (!attestation || typeof attestation !== "string") {
            return { statusCode: 400, body: "Missing or invalid attestation" };
        }
        bytes_attestation = typedArray(Uint8Array)
            .encode(gBase64.toUint8Array(attestation));
        if (!platform_certificates || typeof platform_certificates !== "string") {
            return {
                statusCode: 400,
                body: "Missing or invalid platform_certificates.",
            };
        }
        bytes_platform_certificates = typedArray(Uint8Array)
            .encode(gBase64.toUint8Array(platform_certificates));
        if (!uvm_endorsements || typeof uvm_endorsements !== "string") {
            return { statusCode: 400, body: "Missing or invalid uvm_endorsements." };
        }
        bytes_uvm_endorsements = typedArray(Uint8Array)
            .encode(gBase64.toUint8Array(uvm_endorsements));
    }
    catch (error) {
        return {
            statusCode: 400,
            body: "Error while parsing processor metadata: " + error.message,
        };
    }
    let attestation_result;
    try {
        attestation_result = snp_attestation.verifySnpAttestation(bytes_attestation, bytes_platform_certificates, bytes_uvm_endorsements);
    }
    catch (error) {
        return {
            statusCode: 400,
            body: "Error while verifying attestation: " + error.message,
        };
    }
    const report_data = typedArray(Uint8Array)
        .decode(attestation_result.attestation.report_data);
    const callerId = acl.certUtils.convertToAclFingerprintFormat();
    const array_buf_callerId = string.encode(callerId);
    const expected_report_data = typedArray(Uint8Array)
        .decode(ccf.crypto.digest("SHA-256", array_buf_callerId));
    if (!equal_uint8array(expected_report_data.slice(0, 32), report_data.slice(0, 32))) {
        return {
            statusCode: 400,
            body: "Report data " +
                JSON.stringify({
                    report_data: gBase64.fromUint8Array(typedArray(Uint8Array)
                        .decode(attestation_result.attestation.report_data.slice(0, 32))),
                    cert: gBase64.fromUint8Array(typedArray(Uint8Array).decode(expected_report_data)),
                }),
        };
    }
    let measurement_b64 = gBase64.fromUint8Array(typedArray(Uint8Array)
        .decode(attestation_result.attestation.measurement));
    let policy_b64 = gBase64.fromUint8Array(typedArray(Uint8Array)
        .decode(attestation_result.attestation.host_data));
    let metadata = {
        uvm_endorsements: attestation_result.uvm_endorsements,
        measurement: measurement_b64,
        policy: policy_b64,
    };
    try {
        validateProcessorMetadata(metadata);
    }
    catch (error) {
        return {
            statusCode: 400,
            body: JSON.stringify({
                errormessage: error.message,
                attested_metadata: metadata,
            }),
        };
    }
    const processorCertFingerprint = acl.certUtils.convertToAclFingerprintFormat();
    processors.set(processorCertFingerprint, metadata);
    return { statusCode: 200 };
}

export { getProcessorMetadata, getValidProcessorPolicy, isValidProcessor, registerProcessor, setValidProcessorPolicy };
