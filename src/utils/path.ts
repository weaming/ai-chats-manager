export function joinPath(...parts: string[]): string {
    const allParts = parts.flatMap(part => part.split('/'));
    const nonEmptyParts = allParts.filter(p => p.trim() !== '');
    return nonEmptyParts.join('/');
}
