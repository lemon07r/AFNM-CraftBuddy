// Jest stub for the webpack-emitted worker bundle (asset/source). The real
// file only exists after `bun run build`; an empty string makes the client
// treat blob workers as unavailable and fall back to the sync backend.
export default '';
