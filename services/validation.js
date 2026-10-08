/**
 * Request validation middleware for Express routes.
 * Enforces payload size limits, type checks, and field constraints
 * before reaching route handlers.
 */

const MAX_SCAN_PAYLOAD_BYTES = 5 * 1024 * 1024; // 5 MB per scan payload
const MAX_BATCH_SCANS = 50;
const MAX_BATCH_PAYLOAD_BYTES = 25 * 1024 * 1024; // 25 MB for a full batch
const MAX_IMAGE_BASE64_BYTES = 8 * 1024 * 1024; // 8 MB decoded image cap

const VALID_ASSESSMENTS = new Set(['high', 'moderate', 'low']);
const MAX_DEVICE_ID_LENGTH = 128;
const MAX_DEVICE_NAME_LENGTH = 256;
const MAX_SESSION_ID_LENGTH = 128;
const MAX_TOKEN_LENGTH = 256;

function validateDeviceRequest(req, res, next) {
  const body = req.body || {};
  const deviceId = body.deviceId ?? body.device_id;
  const deviceName = body.deviceName ?? body.device_name;

  if (typeof deviceId !== 'string' || deviceId.trim().length === 0 || deviceId.length > MAX_DEVICE_ID_LENGTH) {
    return res.status(400).json({
      error: `deviceId must be a non-empty string (max ${MAX_DEVICE_ID_LENGTH} chars).`,
      code: 'VALIDATION_ERROR',
    });
  }

  if (deviceName != null && (typeof deviceName !== 'string' || deviceName.length > MAX_DEVICE_NAME_LENGTH)) {
    return res.status(400).json({
      error: `deviceName must be a string (max ${MAX_DEVICE_NAME_LENGTH} chars).`,
      code: 'VALIDATION_ERROR',
    });
  }

  next();
}

function validateSessionRequest(req, res, next) {
  const body = req.body || {};
  const sessionId = body.sessionId ?? body.session_id;
  const deviceId = body.deviceId ?? body.device_id;

  if (typeof sessionId !== 'string' || sessionId.trim().length === 0 || sessionId.length > MAX_SESSION_ID_LENGTH) {
    return res.status(400).json({
      error: `sessionId must be a non-empty string (max ${MAX_SESSION_ID_LENGTH} chars).`,
      code: 'VALIDATION_ERROR',
    });
  }

  if (typeof deviceId !== 'string' || deviceId.trim().length === 0 || deviceId.length > MAX_DEVICE_ID_LENGTH) {
    return res.status(400).json({
      error: `deviceId must be a non-empty string (max ${MAX_DEVICE_ID_LENGTH} chars).`,
      code: 'VALIDATION_ERROR',
    });
  }

  next();
}

function validatePairConfirmRequest(req, res, next) {
  const body = req.body || {};
  const token = body.token;
  const deviceId = body.deviceId ?? body.device_id;
  const deviceName = body.deviceName ?? body.device_name;

  if (typeof token !== 'string' || token.trim().length === 0 || token.length > MAX_TOKEN_LENGTH) {
    return res.status(400).json({
      error: 'token must be a non-empty string.',
      code: 'VALIDATION_ERROR',
    });
  }

  if (typeof deviceId !== 'string' || deviceId.trim().length === 0 || deviceId.length > MAX_DEVICE_ID_LENGTH) {
    return res.status(400).json({
      error: `deviceId must be a non-empty string (max ${MAX_DEVICE_ID_LENGTH} chars).`,
      code: 'VALIDATION_ERROR',
    });
  }

  if (deviceName != null && (typeof deviceName !== 'string' || deviceName.length > MAX_DEVICE_NAME_LENGTH)) {
    return res.status(400).json({
      error: `deviceName must be a string (max ${MAX_DEVICE_NAME_LENGTH} chars).`,
      code: 'VALIDATION_ERROR',
    });
  }

  next();
}

function validatePairUnpairRequest(req, res, next) {
  const body = req.body || {};
  const deviceId = body.deviceId ?? body.device_id;

  if (typeof deviceId !== 'string' || deviceId.trim().length === 0 || deviceId.length > MAX_DEVICE_ID_LENGTH) {
    return res.status(400).json({
      error: `deviceId must be a non-empty string (max ${MAX_DEVICE_ID_LENGTH} chars).`,
      code: 'VALIDATION_ERROR',
    });
  }

  next();
}

function validateSessionEndRequest(req, res, next) {
  const sessionId = req.params?.sessionId;

  if (typeof sessionId !== 'string' || sessionId.trim().length === 0 || sessionId.length > MAX_SESSION_ID_LENGTH) {
    return res.status(400).json({
      error: `sessionId must be a non-empty string (max ${MAX_SESSION_ID_LENGTH} chars).`,
      code: 'VALIDATION_ERROR',
    });
  }

  next();
}

function validateScanPayload(payload) {
  const errors = [];

  if (payload == null || typeof payload !== 'object') {
    return { valid: false, errors: ['Payload must be a JSON object.'] };
  }

  const treeId = payload.treeId ?? payload.tree_id;
  if (typeof treeId !== 'string' || treeId.trim().length === 0 || treeId.length > 128) {
    errors.push('treeId must be a non-empty string (max 128 chars).');
  }

  const scannedAt = payload.scannedAt ?? payload.scanned_at;
  if (typeof scannedAt !== 'string' || !Number.isFinite(Date.parse(scannedAt))) {
    errors.push('scannedAt must be a valid ISO-8601 date string.');
  }

  const assessment = payload.assessment ?? payload.predictedAssessment ?? payload.predicted_assessment;
  if (typeof assessment !== 'string' || !VALID_ASSESSMENTS.has(assessment.toLowerCase())) {
    errors.push(`assessment must be one of: ${[...VALID_ASSESSMENTS].join(', ')}.`);
  }

  const imageBase64 = payload.imageBase64 ?? payload.image_base64;
  if (imageBase64 != null) {
    if (typeof imageBase64 !== 'string') {
      errors.push('imageBase64 must be a string.');
    } else if (imageBase64.length > MAX_IMAGE_BASE64_BYTES) {
      errors.push('imageBase64 exceeds maximum allowed size.');
    }
  }

  return { valid: errors.length === 0, errors };
}

function validateBatchPayload(body) {
  const errors = [];

  if (body == null || typeof body !== 'object') {
    return { valid: false, errors: ['Batch payload must be a JSON object.'] };
  }

  const scans = body.scans;
  if (!Array.isArray(scans)) {
    return { valid: false, errors: ['scans must be an array.'] };
  }

  if (scans.length === 0) {
    return { valid: false, errors: ['scans array must not be empty.'] };
  }

  if (scans.length > MAX_BATCH_SCANS) {
    return { valid: false, errors: [`scans array exceeds maximum of ${MAX_BATCH_SCANS} entries.`] };
  }

  for (let i = 0; i < scans.length; i++) {
    const result = validateScanPayload(scans[i]);
    if (!result.valid) {
      errors.push(`scans[${i}]: ${result.errors.join('; ')}`);
    }
  }

  return { valid: errors.length === 0, errors };
}

function scanPayloadSize(payload) {
  try {
    return Buffer.byteLength(JSON.stringify(payload), 'utf8');
  } catch (_) {
    return Infinity;
  }
}

function validateScanRequest(req, res, next) {
  const body = req.body || {};
  const size = scanPayloadSize(body);
  if (size > MAX_SCAN_PAYLOAD_BYTES) {
    return res.status(413).json({
      error: `Scan payload exceeds maximum of ${MAX_SCAN_PAYLOAD_BYTES} bytes.`,
      code: 'PAYLOAD_TOO_LARGE',
    });
  }

  const result = validateScanPayload(body);
  if (!result.valid) {
    return res.status(400).json({
      error: result.errors.join(' '),
      code: 'VALIDATION_ERROR',
    });
  }

  next();
}

function validateBatchRequest(req, res, next) {
  const body = req.body || {};
  const size = scanPayloadSize(body);
  if (size > MAX_BATCH_PAYLOAD_BYTES) {
    return res.status(413).json({
      error: `Batch payload exceeds maximum of ${MAX_BATCH_PAYLOAD_BYTES} bytes.`,
      code: 'PAYLOAD_TOO_LARGE',
    });
  }

  const result = validateBatchPayload(body);
  if (!result.valid) {
    return res.status(400).json({
      error: result.errors.join(' '),
      code: 'VALIDATION_ERROR',
    });
  }

  next();
}

export {
  MAX_SCAN_PAYLOAD_BYTES,
  MAX_BATCH_SCANS,
  MAX_BATCH_PAYLOAD_BYTES,
  MAX_IMAGE_BASE64_BYTES,
  MAX_DEVICE_ID_LENGTH,
  MAX_DEVICE_NAME_LENGTH,
  MAX_SESSION_ID_LENGTH,
  MAX_TOKEN_LENGTH,
  validateScanPayload,
  validateBatchPayload,
  validateScanRequest,
  validateBatchRequest,
  validateDeviceRequest,
  validateSessionRequest,
  validatePairConfirmRequest,
  validatePairUnpairRequest,
  validateSessionEndRequest,
};