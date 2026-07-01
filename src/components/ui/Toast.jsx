const Toast = ({ toast }) => (
  <div
    className={`fixed bottom-8 left-1/2 -translate-x-1/2 bg-eglux-primary text-white
      py-3 px-6 rounded-full text-[0.88rem] font-medium z-[9999] whitespace-nowrap
      transition-all duration-300
      ${toast.visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-5 pointer-events-none'}`}
    role="status"
    aria-live="polite"
  >
    {toast.msg}
  </div>
);

export default Toast;