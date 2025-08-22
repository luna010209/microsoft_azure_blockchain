const SINGLETON_KEY = new ArrayBuffer(8);
const MAP_PREFIX = "";
function errorResponse(code, msg) {
    return {
        statusCode: code,
        body: {
            error: msg,
        },
    };
}
function result_ok() {
    return { ok: true, value: "Everything ok" };
}
function result_error(msg) {
    return {
        ok: false,
        value: msg,
    };
}
function equal_uint8array(a, b) {
    if (a.length != b.length) {
        return false;
    }
    let dv1 = new Uint8Array(a);
    let dv2 = new Uint8Array(b);
    for (var i = 0; i < a.length; i++) {
        if (dv1[i] != dv2[i]) {
            return false;
        }
    }
    return true;
}
function getCallerCert(request) {
    const callerId = acl.certUtils.convertToAclFingerprintFormat();
    return {
        body: callerId,
    };
}

export { MAP_PREFIX, SINGLETON_KEY, equal_uint8array, errorResponse, getCallerCert, result_error, result_ok };
