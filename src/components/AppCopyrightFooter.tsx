export function AppCopyrightFooter() {
  const year = new Date().getFullYear()

  return (
    <footer className="pt-2 text-center text-xs leading-relaxed text-slate-400">
      <p>
        © {year} ControlStock. Desarrollado por{' '}
        <a
          href="mailto:JRNCarrizo@gmail.com"
          className="text-slate-500 underline-offset-2 hover:text-slate-700 hover:underline"
        >
          JRNCarrizo@gmail.com
        </a>
      </p>
    </footer>
  )
}
