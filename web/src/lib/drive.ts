// Google Drive as a place for the progress file (REQUIREMENTS GD): sign-in with Google Identity
// Services in the browser and the Drive REST API - no backend. Google's script is loaded when
// the Drive is first used; nothing is sent to Google before that. The app only sees the files it
// created itself (permission "drive.file").

/** public by design: it only identifies the app; the allowed origins are set in Google's console */
const CLIENT_ID = '778050941099-ivmmlhka7cer1s0mbqogoe79f5g3s76v.apps.googleusercontent.com'
const SCOPE = 'https://www.googleapis.com/auth/drive.file'
const SIGN_IN_SCRIPT = 'https://accounts.google.com/gsi/client'
const FILES = 'https://www.googleapis.com/drive/v3/files'
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files'
const ABOUT = 'https://www.googleapis.com/drive/v3/about?fields=user(emailAddress)'
const FIELDS = 'id,name,modifiedTime,headRevisionId,trashed'
/** the folder new files go into (the user may rename or move it: it is found again as the app's folder) */
export const DRIVE_FOLDER = 'Terraria Progress Tracker'
const FOLDER_TYPE = 'application/vnd.google-apps.folder'
const ACCOUNT_KEY = 'ttp-drive-account'

/** A progress file in the Drive. */
export interface DriveFile {
  id: string
  name: string
  /** ISO time of the last change */
  modifiedTime: string
  /** changes with every change of the content */
  revision: string
}

/** The Drive file an open progress file lives in, with the revision that was loaded or saved. */
export interface DriveRef {
  id: string
  revision: string
}

/** 'cancelled': the sign-in window was closed; 'gone': the file is deleted or in the trash */
export class DriveError extends Error {
  kind: 'cancelled' | 'gone' | 'other'
  constructor(kind: DriveError['kind'], message: string) {
    super(message)
    this.kind = kind
  }
}

// ------------------------------------------------------------------ sign-in

interface TokenResponse {
  access_token?: string
  expires_in?: number | string
  error?: string
  error_description?: string
}
interface TokenClient {
  requestAccessToken(options?: { prompt?: string }): void
}
interface GoogleAccounts {
  oauth2: {
    initTokenClient(config: {
      client_id: string
      scope: string
      login_hint?: string
      callback: (response: TokenResponse) => void
      error_callback?: (error: { type: string; message?: string }) => void
    }): TokenClient
  }
}
declare global {
  interface Window {
    google?: { accounts: GoogleAccounts }
  }
}

let token: { value: string; expires: number } | null = null
let script: Promise<void> | null = null

function loadSignIn(): Promise<void> {
  if (window.google?.accounts) return Promise.resolve()
  script ??= new Promise<void>((resolve, reject) => {
    const el = document.createElement('script')
    el.src = SIGN_IN_SCRIPT
    el.async = true
    el.onload = () => resolve()
    el.onerror = () => {
      script = null
      reject(new DriveError('other', "Google's sign-in could not be loaded – are you online?"))
    }
    document.head.append(el)
  })
  return script
}

/** The Google account used last (shown in the menu, and preselected in Google's window). */
export function driveAccount(): string | null {
  try {
    return localStorage.getItem(ACCOUNT_KEY)
  } catch {
    return null
  }
}

function rememberAccount(email: string | null) {
  try {
    if (email) localStorage.setItem(ACCOUNT_KEY, email)
    else localStorage.removeItem(ACCOUNT_KEY)
  } catch {
    // only a convenience
  }
}

/**
 * An access token for the Drive. Google's access lasts about an hour and can only be renewed
 * from a click or key press: without a valid token this opens Google's window (it closes by
 * itself when the app is already allowed).
 */
async function accessToken(): Promise<string> {
  if (token && token.expires > Date.now() + 60_000) return token.value
  await loadSignIn()
  const value = await new Promise<string>((resolve, reject) => {
    const client = window.google!.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: SCOPE,
      login_hint: driveAccount() ?? undefined,
      callback: (r) => {
        if (r.error || !r.access_token) {
          const denied = r.error === 'access_denied'
          reject(
            new DriveError(denied ? 'cancelled' : 'other', r.error_description || r.error || 'Google sign-in failed'),
          )
          return
        }
        token = { value: r.access_token, expires: Date.now() + Number(r.expires_in ?? 3600) * 1000 }
        resolve(r.access_token)
      },
      error_callback: (e) =>
        reject(
          e.type === 'popup_closed'
            ? new DriveError('cancelled', 'The Google sign-in was closed.')
            : new DriveError(
                'other',
                e.type === 'popup_failed_to_open'
                  ? "The browser blocked Google's sign-in window – allow pop-ups for this page and try again."
                  : e.message || 'Google sign-in failed',
              ),
        ),
    })
    client.requestAccessToken({ prompt: '' })
  })
  // whose Drive it is: for the menu, and so Google's window does not ask for the account again
  if (!driveAccount()) {
    try {
      const res = await fetch(ABOUT, { headers: { Authorization: `Bearer ${value}` } })
      if (res.ok)
        rememberAccount(((await res.json()) as { user?: { emailAddress?: string } }).user?.emailAddress ?? null)
    } catch {
      // the account name is only shown
    }
  }
  return value
}

/** Sign in (a click or key press): opens Google's window when no access is left. */
export async function driveSignIn(): Promise<void> {
  await accessToken()
}

/** Forget the access and the account on this device (the files in the Drive stay). */
export function driveSignOut() {
  token = null
  rememberAccount(null)
}

// ------------------------------------------------------------------ files

interface RawFile {
  id: string
  name: string
  modifiedTime: string
  headRevisionId?: string
  trashed?: boolean
}

const toFile = (f: RawFile): DriveFile => ({
  id: f.id,
  name: f.name,
  modifiedTime: f.modifiedTime,
  revision: f.headRevisionId ?? f.modifiedTime,
})

async function call(url: string, init: RequestInit = {}, retry = true): Promise<Response> {
  let res: Response
  try {
    res = await fetch(url, { ...init, headers: { ...init.headers, Authorization: `Bearer ${await accessToken()}` } })
  } catch (err) {
    if (err instanceof DriveError) throw err
    throw new DriveError('other', 'Google Drive could not be reached – are you online?')
  }
  if (res.status === 401 && retry) {
    // the access ran out early: once more with a new one
    token = null
    return call(url, init, false)
  }
  if (res.status === 404) throw new DriveError('gone', 'The file is no longer in your Google Drive.')
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null
    throw new DriveError('other', body?.error?.message || `Google Drive answered with an error (${res.status})`)
  }
  return res
}

/** The progress files this app saved to the Drive, newest first. */
export async function listDriveFiles(): Promise<DriveFile[]> {
  const query = new URLSearchParams({
    q: "trashed = false and mimeType = 'application/json'",
    orderBy: 'modifiedTime desc',
    pageSize: '100',
    fields: `files(${FIELDS})`,
  })
  const res = await call(`${FILES}?${query}`)
  return ((await res.json()) as { files?: RawFile[] }).files?.map(toFile) ?? []
}

/** Name, last change and revision of a file; a file in the trash counts as gone. */
export async function driveFileInfo(id: string): Promise<DriveFile> {
  const raw = (await (await call(`${FILES}/${encodeURIComponent(id)}?fields=${FIELDS}`)).json()) as RawFile
  if (raw.trashed) throw new DriveError('gone', 'The file is in the trash of your Google Drive.')
  return toFile(raw)
}

export async function readDriveFile(id: string): Promise<{ file: DriveFile; text: string }> {
  const file = await driveFileInfo(id)
  const text = await (await call(`${FILES}/${encodeURIComponent(id)}?alt=media`)).text()
  return { file, text }
}

/** The app's folder in the Drive: the (oldest) folder this app created, made on first use. */
async function appFolder(): Promise<string> {
  const query = new URLSearchParams({
    q: `trashed = false and mimeType = '${FOLDER_TYPE}'`,
    orderBy: 'createdTime',
    pageSize: '10',
    fields: 'files(id)',
  })
  const found = ((await (await call(`${FILES}?${query}`)).json()) as { files?: { id: string }[] }).files
  if (found?.length) return found[0].id
  const res = await call(`${FILES}?fields=id`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: DRIVE_FOLDER, mimeType: FOLDER_TYPE }),
  })
  return ((await res.json()) as { id: string }).id
}

/** A new file in the app's folder of the Drive (the user can move and rename both). */
export async function createDriveFile(name: string, text: string): Promise<DriveFile> {
  const folder = await appFolder()
  const boundary = `ttp-${Math.random().toString(36).slice(2)}`
  const body = [
    `--${boundary}`,
    'Content-Type: application/json; charset=UTF-8',
    '',
    JSON.stringify({ name, mimeType: 'application/json', parents: [folder] }),
    `--${boundary}`,
    'Content-Type: application/json',
    '',
    text,
    `--${boundary}--`,
  ].join('\r\n')
  const res = await call(`${UPLOAD}?uploadType=multipart&fields=${FIELDS}`, {
    method: 'POST',
    headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
    body,
  })
  return toFile((await res.json()) as RawFile)
}

/** Move a file to the trash of the Drive (it can be restored there for 30 days). */
export async function trashDriveFile(id: string): Promise<void> {
  await call(`${FILES}/${encodeURIComponent(id)}?fields=id`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ trashed: true }),
  })
}

/** Replace the content of a file in the Drive. */
export async function updateDriveFile(id: string, text: string): Promise<DriveFile> {
  const res = await call(`${UPLOAD}/${encodeURIComponent(id)}?uploadType=media&fields=${FIELDS}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: text,
  })
  return toFile((await res.json()) as RawFile)
}
