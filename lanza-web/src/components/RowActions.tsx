import { Link } from "react-router-dom";

type Props = {
  editTo: string;
  onDelete: () => void;
  deleting?: boolean;
  deleteLabel?: string;
};

export function RowActions({ editTo, onDelete, deleting, deleteLabel = "Excluir" }: Props) {
  return (
    <div className="row-actions">
      <Link to={editTo} className="btn btn--sm">
        Editar
      </Link>
      <button
        type="button"
        className="btn btn--sm btn--danger"
        disabled={deleting}
        onClick={onDelete}
      >
        {deleteLabel}
      </button>
    </div>
  );
}
