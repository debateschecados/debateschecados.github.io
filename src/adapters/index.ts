import type { Adapter } from '../types.ts'
import { aosfatos } from './aosfatos.ts'
import { estadao } from './estadao.ts'
import { g1 } from './g1.ts'
import { lupa } from './lupa.ts'

// Adapter kind (as written in config/debates.json) to adapter.
export const registry: ReadonlyMap<string, Adapter> = new Map(
  [g1, lupa, estadao, aosfatos].map((adapter) => [adapter.kind, adapter]),
)
