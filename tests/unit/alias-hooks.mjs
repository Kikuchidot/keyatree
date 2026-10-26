const ROOT = new URL("../../", import.meta.url).href;

export async function resolve(specifier, context, next) {
  if (specifier.startsWith("@/")) {
    return next(new URL(`./${specifier.slice(2)}.ts`, ROOT).href, context);
  }
  return next(specifier, context);
}
