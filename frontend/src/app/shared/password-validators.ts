import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';

export const PASSWORD_MIN = 10;

/** Mirrors the server's basic checks so users get instant feedback (the server remains authoritative). */
export const passwordStrength: ValidatorFn = (
  control: AbstractControl,
): ValidationErrors | null => {
  const value = String(control.value ?? '');
  if (!value) return null;
  return new Set(value).size < 4 ? { weakPassword: true } : null;
};

export function matchControl(otherName: string): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const other = control.parent?.get(otherName);
    return other && control.value !== other.value ? { mismatch: true } : null;
  };
}
