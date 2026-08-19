import { useCallback, useState } from 'react';

/**
 * Dialog state shared by every CRUD page: one create/edit form and one delete
 * confirmation.
 *
 * `record` is kept while the form closes so the fields do not blank out during
 * the closing animation.
 */
export function useCrudDialogs<T>() {
  const [formOpen, setFormOpen] = useState(false);
  const [record, setRecord] = useState<T | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<T | null>(null);

  const openCreate = useCallback(() => {
    setRecord(null);
    setFormOpen(true);
  }, []);

  const openEdit = useCallback((next: T) => {
    setRecord(next);
    setFormOpen(true);
  }, []);

  const closeForm = useCallback(() => setFormOpen(false), []);

  return {
    formOpen,
    setFormOpen,
    /** `null` while creating, the row being edited otherwise. */
    record,
    isEditing: record !== null,
    openCreate,
    openEdit,
    closeForm,

    deleteTarget,
    askDelete: setDeleteTarget,
    cancelDelete: useCallback(() => setDeleteTarget(null), []),
  };
}
