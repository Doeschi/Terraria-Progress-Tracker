import { useConfirmStore } from '@/lib/confirm'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'

export function ConfirmDialogHost() {
  const { options, resolve } = useConfirmStore()
  const finish = (answer: string | null) => {
    resolve?.(answer)
    useConfirmStore.setState({ options: null, resolve: null })
  }
  return (
    <AlertDialog open={!!options} onOpenChange={(open) => !open && finish(null)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{options?.title}</AlertDialogTitle>
          {options?.description && <AlertDialogDescription>{options.description}</AlertDialogDescription>}
        </AlertDialogHeader>
        {/* several answers (choose) can be wider than the dialog: they wrap instead of overflowing it */}
        <AlertDialogFooter className="sm:flex-wrap">
          <AlertDialogCancel onClick={() => finish(null)}>Cancel</AlertDialogCancel>
          {options?.choices ? (
            options.choices.map((c) => (
              <AlertDialogAction
                key={c.id}
                variant={c.destructive ? 'destructive' : 'default'}
                onClick={() => finish(c.id)}
              >
                {c.label}
              </AlertDialogAction>
            ))
          ) : (
            <AlertDialogAction variant={options?.destructive ? 'destructive' : 'default'} onClick={() => finish('ok')}>
              {options?.confirmLabel ?? 'Continue'}
            </AlertDialogAction>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
