const { withDangerousMod } = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

const MARKER_BEGIN = '# @radar-tinder begin fmt-consteval-fix';
const MARKER_END = '# @radar-tinder end fmt-consteval-fix';

/**
 * Works around an Xcode 26 / Apple clang 21 regression that breaks the `fmt`
 * pod (vendored by react-native@0.81 via RCT-Folly) on Release archive builds.
 *
 * The compiler advertises `__cpp_consteval`, so fmt's own detection in
 * Pods/fmt/include/fmt/base.h sets FMT_USE_CONSTEVAL=1, which makes FMT_STRING
 * expand to a `consteval` constructor. Apple clang 21 then fails with
 *   error: call to consteval function 'fmt::basic_format_string<...>' is not a
 *   constant expression
 * at Pods/fmt/include/fmt/format-inl.h lines 59, 60, 1387, 1391, 1394.
 *
 * We cannot disable this via command-line -D because base.h unconditionally
 * redefines FMT_USE_CONSTEVAL (no include guard), and -U__cpp_consteval does
 * not unset built-in feature-test macros on Apple clang. The only reliable
 * fix is to patch base.h so that any Apple clang build forces
 * FMT_USE_CONSTEVAL=0 (matching fmt's existing handling for Apple clang < 14).
 *
 * This is applied twice on purpose:
 *   1. From `withDangerousMod` during `expo prebuild` so the change survives
 *      `--clean` regenerations of ios/.
 *   2. From the Podfile post_install hook so it stays applied after every
 *      `pod install` (which can re-extract fmt headers).
 */
const PODFILE_BLOCK = `
    ${MARKER_BEGIN}
    fmt_base_h = File.join(installer.sandbox.root.to_s, 'fmt', 'include', 'fmt', 'base.h')
    if File.exist?(fmt_base_h)
      fmt_content = File.read(fmt_base_h)
      unless fmt_content.include?('radar-tinder fmt-consteval-fix')
        fmt_patched = fmt_content.sub(
          /^#elif defined\\(__cpp_consteval\\)\\n#  define FMT_USE_CONSTEVAL 1/,
          "#elif defined(__apple_build_version__)\\n#  define FMT_USE_CONSTEVAL 0  // radar-tinder fmt-consteval-fix: Apple clang consteval broken in Xcode 26\\n#elif defined(__cpp_consteval)\\n#  define FMT_USE_CONSTEVAL 1"
        )
        if fmt_patched != fmt_content
          File.chmod(0o644, fmt_base_h) rescue nil
          File.write(fmt_base_h, fmt_patched)
          puts "[radar-tinder] Patched Pods/fmt/include/fmt/base.h to disable consteval under Apple clang"
        end
      end
    end
    ${MARKER_END}
`;

function patchBaseH(headerPath) {
  if (!fs.existsSync(headerPath)) {
    return false;
  }
  const content = fs.readFileSync(headerPath, 'utf8');
  if (content.includes('radar-tinder fmt-consteval-fix')) {
    return false;
  }
  const target =
    '#elif defined(__cpp_consteval)\n#  define FMT_USE_CONSTEVAL 1';
  const replacement =
    '#elif defined(__apple_build_version__)\n' +
    '#  define FMT_USE_CONSTEVAL 0  // radar-tinder fmt-consteval-fix: Apple clang consteval broken in Xcode 26\n' +
    '#elif defined(__cpp_consteval)\n' +
    '#  define FMT_USE_CONSTEVAL 1';
  if (!content.includes(target)) {
    return false;
  }
  try {
    fs.chmodSync(headerPath, 0o644);
  } catch {
    // best effort; if chmod fails, the write below will throw a clearer error
  }
  fs.writeFileSync(headerPath, content.replace(target, replacement));
  return true;
}

function ensurePodfileBlock(podfilePath) {
  let content = fs.readFileSync(podfilePath, 'utf8');

  // Refresh any prior application of our block.
  const existingRegex = new RegExp(
    `\\n?[ \\t]*${MARKER_BEGIN.replace(/[.*+?^${}()|[\]\\\\]/g, '\\\\$&')}[\\s\\S]*?${MARKER_END.replace(/[.*+?^${}()|[\]\\\\]/g, '\\\\$&')}\\n?`,
    'g'
  );
  const beforeLen = content.length;
  content = content.replace(existingRegex, '\n').replace(/\n{3,}/g, '\n\n');
  if (content.length !== beforeLen) {
    // continue
  }

  const tailMatch = content.match(/\n(\s*)end\s*\nend\s*$/);
  if (!tailMatch) {
    return false;
  }

  const block = PODFILE_BLOCK.replace(/^\n/, '');
  const nextContent = content.replace(
    /\n(\s*)end\s*\nend\s*$/,
    `\n${block}\n  end\nend\n`
  );
  if (nextContent === content) {
    return false;
  }
  fs.writeFileSync(podfilePath, nextContent);
  return true;
}

module.exports = function withIosFmtConstevalFix(config) {
  return withDangerousMod(config, [
    'ios',
    async (config) => {
      const iosRoot = config.modRequest.platformProjectRoot;

      // 1) Patch fmt header directly if Pods/fmt has been installed already.
      const headerPath = path.join(
        iosRoot,
        'Pods',
        'fmt',
        'include',
        'fmt',
        'base.h'
      );
      if (patchBaseH(headerPath)) {
        console.log('✅ Patched ios/Pods/fmt/include/fmt/base.h (consteval fix)');
      }

      // 2) Add a Podfile post_install hook so the patch re-applies after pod install.
      const podfilePath = path.join(iosRoot, 'Podfile');
      if (ensurePodfileBlock(podfilePath)) {
        console.log('✅ Added iOS fmt consteval fix hook to Podfile');
      }

      return config;
    },
  ]);
};
