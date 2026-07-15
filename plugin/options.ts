import {
  DEFAULT_IMPORT_OPTIONS,
  EMOJI_SIZES,
  ImportOptions,
  EmojiSizeKey,
  STORAGE_KEYS,
} from "./constants";

function isSizeKey(value: unknown): value is EmojiSizeKey {
  return typeof value === "string" && value in EMOJI_SIZES;
}

export async function getImportOptions(): Promise<ImportOptions> {
  const size = await figma.clientStorage.getAsync(STORAGE_KEYS.EMOJI_SIZE);

  return {
    size: isSizeKey(size) ? size : DEFAULT_IMPORT_OPTIONS.size,
  };
}

export async function saveImportOptions(options: ImportOptions): Promise<void> {
  const size = isSizeKey(options.size) ? options.size : DEFAULT_IMPORT_OPTIONS.size;
  await figma.clientStorage.setAsync(STORAGE_KEYS.EMOJI_SIZE, size);
}

export function normalizeImportOptions(raw: Partial<ImportOptions> | null | undefined): ImportOptions {
  return {
    size: isSizeKey(raw?.size) ? raw.size : DEFAULT_IMPORT_OPTIONS.size,
  };
}
