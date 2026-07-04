export function resolveSecret(secretRef: string): string {
  const value = process.env[secretRef];
  if (!value) {
    throw new Error(`Required secret "${secretRef}" is not available in the environment.`);
  }

  return value;
}

export function resolveOptionalSecret(secretRef?: string): string | undefined {
  if (!secretRef) {
    return undefined;
  }

  return process.env[secretRef];
}
