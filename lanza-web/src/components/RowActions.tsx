import { Link } from "react-router-dom";

import { IconEdit, IconTrash } from "@/components/icons";

type Props = {
  editTo: string;
  onDelete: () => void;
  deleting?: boolean;
  deleteLabel?: string;
};

export function RowActions({ editTo, onDelete, deleting, deleteLabel = "Excluir" }: Props) {
  return (
    <div className="row-actions">
      <Link to={editTo} className="btn btn--icon" aria-label="Editar" title="Editar">
        <IconEdit />
      </Link>
      <button
        type="button"
        className="btn btn--icon btn--icon-danger"
        disabled={deleting}
        onClick={onDelete}
        aria-label={deleteLabel}
        title={deleteLabel}
      >
        <IconTrash />
      </button>
    </div>
  );
}
