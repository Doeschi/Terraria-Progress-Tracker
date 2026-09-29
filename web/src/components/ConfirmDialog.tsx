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
  const finish = (ok: boolean) => {
    resolve?.(ok)
    useConfirmStore.setState({ options: null, resolve: null })
  }
  return (
    <AlertDialog open={!!options} onOpenChange={(open) => !open && finish(false)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{options?.title}</AlertDialogTitle>
          {options?.description && <AlertDialogDescription>{options.description}</AlertDialogDescription>}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => finish(false)}>Cancel</AlertDialogCancel>
          <AlertDialogAction variant={options?.destructive ? 'destructive' : 'default'} onClick={() => finish(true)}>
            {options?.confirmLabel ?? 'Continue'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
