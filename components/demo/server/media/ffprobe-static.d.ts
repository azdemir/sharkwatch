// ffprobe-static ships no TypeScript types (its package has no types field),
// so this declaration covers the one value the port uses: the binary path.
declare module 'ffprobe-static' {
  const ffprobeStatic: { path: string };
  export default ffprobeStatic;
}
