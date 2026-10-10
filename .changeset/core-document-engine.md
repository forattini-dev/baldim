---
"@baldim/core": minor
---

Add schema-inferred resource types, document query predicates/projection/ordering, persisted composite and sparse indexes with transactional uniqueness, ETag-based mutations, resumable migrations, and partition integrity auditing/repair. Keep plain equality filtering native when available and apply fallback query offsets after filtering. Unique indexes require transactional storage; nontransactional index maintenance exposes explicit recovery journals and quiescent repair.
