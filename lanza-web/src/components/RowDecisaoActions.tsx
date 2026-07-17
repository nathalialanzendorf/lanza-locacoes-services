import { IconCheck, IconX } from "@/components/icons";

type Props = {
  onApprove: () => void;
  onReject: () => void;
  disabled?: boolean;
};

export function RowDecisaoActions({ onApprove, onReject, disabled }: Props) {
  return (
    <div className="row-actions">
      <button
        type="button"
        className="btn btn--icon btn--icon-ok"
        disabled={disabled}
        onClick={onApprove}
        aria-label="Aprovar"
        title="Aprovar"
      >
        <IconCheck />
      </button>
      <button
        type="button"
        className="btn btn--icon btn--icon-danger"
        disabled={disabled}
        onClick={onReject}
        aria-label="Reprovar"
        title="Reprovar"
      >
        <IconX />
      </button>
    </div>
  );
}
