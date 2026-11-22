import type Ionicons from '@expo/vector-icons/Ionicons';
import * as repo from '@/database/categoryRepository';
import { emitContactsChanged } from '@/services/dataEvents';
import { requestSync } from '@/services/syncService';
import type { Category } from '@/types/contact';

export type { CategoryWithCount } from '@/database/categoryRepository';

/** Colours offered when creating a category (all readable with white text). */
export const CATEGORY_COLORS = [
  '#4F46E5', '#7C3AED', '#DB2777', '#DC2626', '#EA580C',
  '#D97706', '#16A34A', '#0D9488', '#0284C7', '#475569',
] as const;

/** Optional icons for categories (Ionicons names). */
export const CATEGORY_ICONS: readonly (keyof typeof Ionicons.glyphMap)[] = [
  'people', 'heart', 'briefcase', 'business', 'cart', 'school',
  'calendar', 'home', 'airplane', 'medkit', 'construct', 'star',
];

/** One-tap suggestions for a new user. */
export const STARTER_CATEGORIES: { name: string; color: string; icon: string }[] = [
  { name: 'Family', color: '#DB2777', icon: 'heart' },
  { name: 'Friends', color: '#7C3AED', icon: 'people' },
  { name: 'Clients', color: '#4F46E5', icon: 'briefcase' },
  { name: 'Vendors', color: '#EA580C', icon: 'cart' },
  { name: 'Office', color: '#0284C7', icon: 'business' },
  { name: 'College', color: '#16A34A', icon: 'school' },
  { name: 'Events', color: '#D97706', icon: 'calendar' },
  { name: 'Personal', color: '#0D9488', icon: 'home' },
];

export const MAX_NAME = 40;
export const MAX_COLOR = 7;

/** Returns an error message, or null when the name is acceptable. */
export function validateCategoryName(name: string): string | null {
  const n = name.trim();
  if (!n) return 'Give the category a name.';
  if (n.length > MAX_NAME) return `Keep it under ${MAX_NAME} characters.`;
  return null;
}

/** Stores colours as 6-digit hex values for consistent rendering and syncing. */
export function validateCategoryColor(color: string): string | null {
  if (!/^#[0-9A-Fa-f]{6}$/.test(color.trim())) return 'Choose a valid 6-digit hex colour, e.g. #2563EB.';
  return null;
}

function changed() {
  emitContactsChanged();
  requestSync();
}

export const getCategories = () => repo.findAllWithCounts();
export const getCategory = (id: string) => repo.findById(id);
export const getCategoryOverlaps = () => repo.overlaps();

export async function createCategory(input: { name: string; color: string; icon: string | null }): Promise<Category> {
  const name = input.name.trim();
  const error = validateCategoryName(name);
  if (error) throw new Error(error);
  if (await repo.nameExists(name)) throw new Error(`You already have a category called "${name}".`);
  const created = await repo.insert({ ...input, name }, new Date().toISOString());
  changed();
  return created;
}

export async function updateCategory(id: string, input: { name: string; color: string; icon: string | null }): Promise<void> {
  const name = input.name.trim();
  const error = validateCategoryName(name);
  if (error) throw new Error(error);
  if (await repo.nameExists(name, id)) throw new Error(`You already have a category called "${name}".`);
  await repo.update(id, { ...input, name }, new Date().toISOString());
  changed();
}

/** Deletes the category; its contacts are kept, just no longer in it. */
export async function deleteCategory(id: string): Promise<void> {
  await repo.softDelete(id, new Date().toISOString());
  changed();
}

/** Adds the starter categories the user doesn't already have. */
export async function addStarterCategories(names: string[]): Promise<void> {
  for (const s of STARTER_CATEGORIES.filter((c) => names.includes(c.name))) {
    if (!(await repo.nameExists(s.name))) await repo.insert(s, new Date().toISOString());
  }
  changed();
}
