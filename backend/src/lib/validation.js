/** Convert a zod error into { field: firstMessage }. Shared by all modules. */
export function fieldErrors(zodError) {
  const fields = {};
  for (const issue of zodError.issues) {
    const key = issue.path.join(".") || "_";
    if (!(key in fields)) fields[key] = issue.message;
  }
  return fields;
}
