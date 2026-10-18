import { useEffect, useState } from 'react';
import type { PasswordFieldDescriptor } from 'shared';
import { IconEye, IconEyeOff } from '../Icons';
import type { ValueFieldProps } from './types';

export default function PasswordField({
    field,
    value,
    onChange,
}: ValueFieldProps<PasswordFieldDescriptor, string>) {
    const [local, setLocal] = useState(value);
    const [revealed, setRevealed] = useState(false);
    useEffect(() => {
        setLocal(value);
    }, [value]);

    const commit = () => {
        if (local !== value) onChange(local);
    };

    return (
        <div>
            <div className="text-sm font-medium text-gray-800 dark:text-gray-200 mb-1">
                {field.label}
            </div>
            {field.description && (
                <div className="text-xs text-gray-400 mb-2">
                    {field.description}
                </div>
            )}
            <div className="relative">
                <input
                    className="input-field pr-10"
                    type={revealed ? 'text' : 'password'}
                    value={local}
                    placeholder={field.placeholder}
                    autoComplete="new-password"
                    onChange={(e) => setLocal(e.target.value)}
                    onBlur={commit}
                    onKeyDown={(e) => e.key === 'Enter' && commit()}
                />
                <button
                    type="button"
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1 flex items-center justify-center text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 cursor-pointer bg-transparent border-none"
                    onClick={() => setRevealed((prev) => !prev)}
                    tabIndex={-1}
                    aria-label={revealed ? '隐藏' : '显示'}
                    title={revealed ? '隐藏' : '显示'}
                >
                    {revealed ? (
                        <IconEyeOff size={16} />
                    ) : (
                        <IconEye size={16} />
                    )}
                </button>
            </div>
        </div>
    );
}
