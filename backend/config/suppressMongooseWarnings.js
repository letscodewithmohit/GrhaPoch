// Only allow Server running and MongoDB Connected messages - suppress all other console output
const _log = console.log;
const _warn = console.warn;
const _info = console.info;

console.log = (...args) => {
  const msg = String(args[0] || '');
  if (msg.includes('Server running') || msg.includes('MongoDB Connected')) {
    _log.apply(console, args);
  }
};

console.warn = (...args) => {
  const msg = String(args[0] || '');
  if (msg.includes('Duplicate schema index') || msg.includes('[MONGOOSE]')) return;
  _warn.apply(console, args);
};

console.info = (...args) => {
  const msg = String(args[0] || '');
  if (msg.includes('MongoDB Connected')) {
    _info.apply(console, args);
  }
};

// Patch stdout - only allow Server running, MongoDB Connected, and Backend Status block
const _stdoutWrite = process.stdout.write.bind(process.stdout);
process.stdout.write = (chunk, encoding, callback) => {
  const str = chunk.toString();
  const cb = typeof encoding === 'function' ? encoding : callback;
  const allowed = str.includes('Server running') || str.includes('MongoDB Connected') ||
    str.includes('✅') || str.includes('❌') || str.includes('Backend Status') ||
    str.includes('────') || str.includes('connected') || str.includes('running') ||
    str.includes('active') || str.includes('inactive') || str.includes('ready') ||
    str.includes('disabled') || str.includes('Server') || str.includes('MongoDB') ||
    str.includes('Firebase') || str.includes('Razorpay') || str.includes('Redis');
  if (allowed) {
    return _stdoutWrite(chunk, encoding, callback);
  }
  if (cb) cb();
  return true;
};

// Patch stderr - suppress Mongoose warnings
const _stderrWrite = process.stderr.write.bind(process.stderr);
process.stderr.write = (chunk, encoding, callback) => {
  const str = chunk.toString();
  const cb = typeof encoding === 'function' ? encoding : callback;
  if (str.includes('[MONGOOSE]') || str.includes('Duplicate schema index') || str.includes('--trace-warnings')) {
    if (cb) cb();
    return true;
  }
  // Allow MongoDB Connected and Backend Status from winston
  if (str.includes('MongoDB Connected') || str.includes('✅') || str.includes('❌') || str.includes('Backend')) {
    return _stderrWrite(chunk, encoding, callback);
  }
  // Suppress other info-level logs from winston
  if (str.includes('info:') && !str.includes('error')) {
    if (cb) cb();
    return true;
  }
  return _stderrWrite(chunk, encoding, callback);
};
