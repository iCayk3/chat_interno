/**
 * Utilitários de controle de acesso baseado em papel (RBAC) e isolamento departamental
 */

export function isSameDepartment(deptA?: string, deptB?: string): boolean {
  if (!deptA || !deptB) return false;
  const a = deptA.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const b = deptB.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (a === b) return true;

  // Mapeamento de termos e palavras-chave correspondentes
  const keywords = ['suport', 'financ', 'comerc', 'ouvidor', 'faturam', 'vend', 'geral', 'atend'];
  for (const kw of keywords) {
    if (a.includes(kw) && b.includes(kw)) return true;
  }
  return false;
}
