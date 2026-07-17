import { Link } from "react-router-dom";

import { IconEdit, IconTrash } from "@/components/icons";
import { LABEL } from "@/lib/labels";

type Props = {
  editTo: string;
  onDelete: () => void;
  deleting?: boolean;
  deleteLabel?: string;
};

export function RowActions({ editTo, onDelete, deleting, deleteLabel = LABEL.excluir }: Props) {
  return (
    <div className="row-actions">
      <Link to={editTo} className="btn btn--icon" aria-label={LABEL.editar} title={LABEL.editar}>
        <IconEdit className="row-actions__icon" />
      </Link>
      <button
        type="button"
        className="btn btn--icon btn--icon-danger"
        disabled={deleting}
        onClick={onDelete}
        aria-label={deleteLabel}
        title={deleteLabel}
      >
        <IconTrash className="row-actions__icon" />
      </button>
    </div>
  );
}
