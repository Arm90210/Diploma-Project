import { useEffect, useRef, type ReactNode } from 'react';
import { Icon } from './Icon';
export function Modal({ title, children, close }: { title: string; children: ReactNode; close: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { ref.current?.showModal(); const previous = document.body.style.overflow; document.body.style.overflow = 'hidden'; return () => { document.body.style.overflow = previous; }; }, []);
  return <dialog ref={ref} className="modal" onCancel={event => { event.preventDefault(); close(); }} onClick={event => { if(event.target === event.currentTarget) close(); }} aria-label={title}><div className="modal-inner"><button className="icon-button modal-close" onClick={close} aria-label="Close dialog"><Icon name="close" /></button>{children}</div></dialog>;
}
