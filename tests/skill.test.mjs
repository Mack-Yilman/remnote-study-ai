import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const SKILL_MD = path.resolve(import.meta.dirname, '..', 'skills', 'remnote', 'SKILL.md');

test('1. Skill remnote: description del frontmatter mide <= 500 caracteres y contiene RemNote', () => {
  const contenido = fs.readFileSync(SKILL_MD, 'utf8');
  const match = contenido.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  assert.ok(match, 'Debe tener frontmatter YAML');

  const descMatch = match[1].match(/^description:\s*(.+)$/m);
  assert.ok(descMatch, 'El frontmatter debe tener description');

  const description = descMatch[1].trim().replace(/^['"]|['"]$/g, '');
  assert.ok(description.length <= 500, `description mide ${description.length} caracteres (máximo 500)`);
  assert.ok(description.includes('RemNote'), 'description debe contener "RemNote"');
});
