export function message(error: unknown) {
  const details = error as { code?: string; message?: string } | null;
  const raw = details?.message ?? '';
  if (details?.code === '40001' || raw.includes('Tracker changed elsewhere')) {
    return 'Дневник изменился на другом устройстве. Обновите страницу.';
  }
  const authErrors: Record<string, string> = {
    invalid_credentials: 'Неверный адрес электронной почты или пароль.',
    email_not_confirmed: 'Подтвердите адрес по ссылке из письма.',
    user_already_exists: 'Аккаунт с таким адресом уже существует.',
    weak_password: 'Пароль слишком простой. Укажите не менее шести символов.',
    same_password: 'Укажите пароль, отличный от текущего.',
    over_email_send_rate_limit: 'Слишком много запросов. Подождите перед повторной отправкой.',
    over_request_rate_limit: 'Слишком много запросов. Попробуйте позже.',
    email_address_invalid: 'Укажите действительный адрес электронной почты.',
    email_address_not_authorized: 'Сервис не может отправить письмо на этот адрес.',
    otp_expired: 'Срок действия ссылки истёк. Запросите новую.',
  };
  if (details?.code && authErrors[details.code]) return authErrors[details.code];
  if (/^[А-ЯЁ]/.test(raw)) return raw;
  return 'Не удалось выполнить действие. Попробуйте ещё раз.';
}

export function Bell() {
  return <svg viewBox="0 0 32 32" fill="none" aria-hidden="true">
    <path d="M10 12 8.5 7.5C8 5.8 9.3 4 11.3 4h9.4c2 0 3.3 1.8 2.8 3.5L22 12" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"/>
    <circle cx="16" cy="20" r="9.5" fill="currentColor"/>
    <path d="M12.4 21a3.8 3.8 0 0 1 2.2-4" stroke="#FFFFFF" strokeWidth="1.6" strokeLinecap="round"/>
  </svg>;
}
