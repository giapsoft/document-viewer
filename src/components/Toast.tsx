interface ToastProps {
  message: string;
}

export function Toast({ message }: ToastProps) {
  return (
    <div className="app-toast" role="status" aria-live="polite">
      {message}
    </div>
  );
}
