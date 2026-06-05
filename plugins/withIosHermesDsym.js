const { withDangerousMod } = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

const MARKER_BEGIN = '# @radar-tinder begin hermes-dsym';
const MARKER_END = '# @radar-tinder end hermes-dsym';

const HERMES_DSYM_PODFILE_BLOCK = `
    ${MARKER_BEGIN}
    hermes_dsym_script = <<-'SCRIPT'
#!/usr/bin/env bash
set -euo pipefail

if [[ "\${PLATFORM_NAME:-}" != "iphoneos" ]]; then
  exit 0
fi

if [[ -z "\${DWARF_DSYM_FOLDER_PATH:-}" ]]; then
  echo "warning: Hermes dSYM generation skipped; DWARF_DSYM_FOLDER_PATH is empty"
  exit 0
fi

HERMES_BINARY="\${TARGET_BUILD_DIR:-}/\${FRAMEWORKS_FOLDER_PATH:-}/hermes.framework/hermes"
if [[ ! -f "\${HERMES_BINARY}" && -n "\${PODS_ROOT:-}" ]]; then
  HERMES_BINARY="\${PODS_ROOT}/hermes-engine/destroot/Library/Frameworks/universal/hermes.xcframework/ios-arm64/hermes.framework/hermes"
fi

if [[ ! -f "\${HERMES_BINARY}" ]]; then
  echo "warning: Hermes binary not found; dSYM generation skipped"
  exit 0
fi

OUT_DSYM="\${DWARF_DSYM_FOLDER_PATH}/hermes.framework.dSYM"
mkdir -p "\${DWARF_DSYM_FOLDER_PATH}"

BINARY_UUID="$(dwarfdump --uuid "\${HERMES_BINARY}" 2>/dev/null | awk '{print $2}' | head -n 1 || true)"
EXISTING_UUID=""
if [[ -f "\${OUT_DSYM}/Contents/Resources/DWARF/hermes" ]]; then
  EXISTING_UUID="$(dwarfdump --uuid "\${OUT_DSYM}" 2>/dev/null | awk '{print $2}' | head -n 1 || true)"
fi

if [[ -n "\${BINARY_UUID}" && "\${BINARY_UUID}" == "\${EXISTING_UUID}" ]]; then
  echo "Hermes dSYM already present for UUID \${BINARY_UUID}"
  exit 0
fi

echo "Generating Hermes dSYM for App Store symbol validation"
xcrun dsymutil "\${HERMES_BINARY}" -o "\${OUT_DSYM}" >/dev/null 2>&1 || dsymutil "\${HERMES_BINARY}" -o "\${OUT_DSYM}" >/dev/null 2>&1

GENERATED_UUID="$(dwarfdump --uuid "\${OUT_DSYM}" 2>/dev/null | awk '{print $2}' | head -n 1 || true)"
if [[ -n "\${BINARY_UUID}" && "\${GENERATED_UUID}" != "\${BINARY_UUID}" ]]; then
  echo "warning: Generated Hermes dSYM UUID \${GENERATED_UUID:-missing} does not match binary UUID \${BINARY_UUID}"
else
  echo "Hermes dSYM ready at \${OUT_DSYM}"
fi
SCRIPT

    installer.aggregate_targets.each do |aggregate_target|
      user_project = aggregate_target.user_project
      next unless user_project

      user_project.native_targets.each do |native_target|
        next unless native_target.name == 'RadarTinder'

        phase = native_target.shell_script_build_phases.find { |item| item.name == '[RT] Generate Hermes dSYM' }
        phase ||= native_target.new_shell_script_build_phase('[RT] Generate Hermes dSYM')
        phase.shell_path = '/bin/sh'
        phase.shell_script = hermes_dsym_script
        phase.always_out_of_date = '1' if phase.respond_to?(:always_out_of_date=)
      end

      user_project.save
    end
    ${MARKER_END}
`;

module.exports = function withIosHermesDsym(config) {
  return withDangerousMod(config, [
    'ios',
    async (config) => {
      const podfilePath = path.join(config.modRequest.platformProjectRoot, 'Podfile');
      let content = fs.readFileSync(podfilePath, 'utf8');

      if (content.includes(MARKER_BEGIN)) {
        return config;
      }

      const nextContent = content.replace(
        /\n  end\s*\nend\s*$/,
        `${HERMES_DSYM_PODFILE_BLOCK}\n  end\nend\n`
      );

      if (nextContent === content) {
        throw new Error('Unable to add Hermes dSYM Podfile hook; post_install block shape changed.');
      }

      fs.writeFileSync(podfilePath, nextContent);
      console.log('✅ Added iOS Hermes dSYM archive hook');
      return config;
    },
  ]);
};
