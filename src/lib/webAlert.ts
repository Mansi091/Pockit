import { Alert, Platform, type AlertButton } from 'react-native';

/**
 * React Native Web's Alert.alert does nothing, which would silently break every
 * confirmation ("Delete contact?", "Discard changes?") on the website.
 * On web, Alert.alert shows Pockit's own dialog (components/WebDialogHost),
 * with the real buttons. Before that host has mounted, it falls back to the
 * browser's confirm/alert. Imported once from the root layout. No effect on Android/iOS.
 */
export interface WebDialogRequest {
  title: string;
  message?: string;
  buttons: AlertButton[];
}

type Host = (req: WebDialogRequest) => void;
let host: Host | null = null;

export function registerWebDialogHost(h: Host | null) {
  host = h;
}

function browserFallback({ title, message, buttons }: WebDialogRequest) {
  const text = [title, message].filter(Boolean).join('\n\n');
  const cancel = buttons.find((b) => b.style === 'cancel');
  const actions = buttons.filter((b) => b !== cancel);
  if (actions.length === 0) {
    window.alert(text);
    cancel?.onPress?.();
  } else if (window.confirm(`${text}\n\nOK = ${actions[0]!.text ?? 'OK'}`)) {
    actions[0]!.onPress?.();
  } else {
    cancel?.onPress?.();
  }
}

if (Platform.OS === 'web' && typeof window !== 'undefined') {
  Alert.alert = (title: string, message?: string, buttons?: AlertButton[]) => {
    const req = { title, message, buttons: buttons?.length ? buttons : [{ text: 'OK' }] };
    if (host) host(req);
    else browserFallback(req);
  };
}
