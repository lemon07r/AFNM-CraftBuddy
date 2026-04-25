import * as fs from 'fs';
import * as path from 'path';

type CliArgs = {
  changeNote?: string;
  description?: string;
  descriptionFile?: string;
  workshopId: string;
  zipPath: string;
  skipBuild: boolean;
  skipUploaderPrepare: boolean;
  openWorkshopPage: boolean;
  json: boolean;
  help: boolean;
};

const DEFAULT_WORKSHOP_ID = '3661729323';

function printUsage(): void {
  console.log(`CraftBuddy workshop upload

Usage:
  bun run workshop:upload -- --change-note "What changed"

Options:
  --change-note <text>        Change notes for the workshop update
  --description <text>        Optional workshop description override
  --description-file <path>   Optional file containing the workshop description
  --workshop-id <id>          Override the default CraftBuddy workshop item ID
  --zip <path>                Override the default build zip path
  --skip-build                Skip rebuilding CraftBuddy before upload
  --skip-uploader-prepare     Skip rebuilding ModUploader-AFNM before upload
  --open-workshop-page        Open the workshop page in Steam overlay after upload
  --json                      Ask the uploader for machine-readable output
  --help                      Show this help
`);
}

function consumeValue(args: string[], index: number, flag: string): string {
  const value = args[index + 1];
  if (!value || value.startsWith('--')) {
    throw new Error(`Missing value for ${flag}`);
  }
  return value;
}

function parseArgs(argv: string[]): CliArgs {
  const repoRoot = path.resolve(import.meta.dir, '..');
  const parsed: CliArgs = {
    workshopId: DEFAULT_WORKSHOP_ID,
    zipPath: path.resolve(repoRoot, 'builds', 'afnm-craftbuddy.zip'),
    skipBuild: false,
    skipUploaderPrepare: false,
    openWorkshopPage: false,
    json: false,
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    switch (arg) {
      case '--help':
        parsed.help = true;
        break;
      case '--skip-build':
        parsed.skipBuild = true;
        break;
      case '--skip-uploader-prepare':
        parsed.skipUploaderPrepare = true;
        break;
      case '--open-workshop-page':
        parsed.openWorkshopPage = true;
        break;
      case '--json':
        parsed.json = true;
        break;
      case '--change-note':
        parsed.changeNote = consumeValue(argv, index, arg);
        index += 1;
        break;
      case '--description':
        parsed.description = consumeValue(argv, index, arg);
        index += 1;
        break;
      case '--description-file':
        parsed.descriptionFile = path.resolve(consumeValue(argv, index, arg));
        index += 1;
        break;
      case '--workshop-id':
        parsed.workshopId = consumeValue(argv, index, arg);
        index += 1;
        break;
      case '--zip':
        parsed.zipPath = path.resolve(consumeValue(argv, index, arg));
        index += 1;
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return parsed;
}

function runCommand(
  label: string,
  cmd: string[],
  cwd: string,
  captureOutput = false,
): { stdoutText?: string } {
  console.log(`\n== ${label} ==`);
  console.log(`$ ${cmd.join(' ')}`);

  const result = Bun.spawnSync({
    cmd,
    cwd,
    stdout: captureOutput ? 'pipe' : 'inherit',
    stderr: 'inherit',
    stdin: 'inherit',
  });

  if (result.exitCode !== 0) {
    throw new Error(`${label} failed with exit code ${result.exitCode}`);
  }

  return {
    stdoutText:
      captureOutput && result.stdout
        ? Buffer.from(result.stdout).toString('utf8').trim()
        : undefined,
  };
}

function readDescriptionFile(filePath: string): string {
  const text = fs.readFileSync(filePath, 'utf8').trim();
  if (!text.startsWith('---')) {
    return text;
  }

  const endIndex = text.indexOf('\n---', 3);
  if (endIndex < 0) {
    return text;
  }

  return text.slice(endIndex + 4).trim();
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printUsage();
    return;
  }

  if (!args.changeNote) {
    throw new Error('Missing required --change-note argument');
  }

  if (args.description && args.descriptionFile) {
    throw new Error('Use only one of --description or --description-file');
  }

  const repoRoot = path.resolve(import.meta.dir, '..');
  const uploaderRoot = path.resolve(repoRoot, '..', 'ModUploader-AFNM');
  const description = args.descriptionFile
    ? readDescriptionFile(args.descriptionFile)
    : args.description;

  if (!fs.existsSync(uploaderRoot)) {
    throw new Error(`ModUploader-AFNM not found at ${uploaderRoot}`);
  }

  if (!args.skipBuild) {
    runCommand(
      'Build CraftBuddy',
      [process.execPath, 'run', 'build'],
      repoRoot,
    );
  }

  if (!fs.existsSync(args.zipPath)) {
    throw new Error(`Build zip not found at ${args.zipPath}`);
  }

  if (!args.skipUploaderPrepare) {
    runCommand(
      'Prepare ModUploader-AFNM',
      [process.execPath, 'run', 'cli:prepare'],
      uploaderRoot,
    );
  }

  const uploadArgs = [
    process.execPath,
    'run',
    'cli:upload',
    '--',
    '--workshop-id',
    args.workshopId,
    '--zip',
    args.zipPath,
    '--change-note',
    args.changeNote,
  ];

  if (args.openWorkshopPage) {
    uploadArgs.push('--open-workshop-page');
  }

  if (description) {
    uploadArgs.push('--description', description);
  }

  if (args.json) {
    uploadArgs.push('--json');
  }

  const uploadResult = runCommand(
    'Upload to Steam Workshop',
    uploadArgs,
    uploaderRoot,
    args.json,
  );

  if (args.json && uploadResult.stdoutText) {
    console.log(uploadResult.stdoutText);
    return;
  }

  console.log('\nWorkshop upload completed.');
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Workshop upload wrapper failed: ${message}`);
  printUsage();
  process.exit(1);
});
