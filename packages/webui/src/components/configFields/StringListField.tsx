import { useEffect, useState } from 'react';
import type { StringListFieldDescriptor } from 'shared';
import { parseStringList } from 'shared';
import type { ValueFieldProps } from './types';

export default function StringListField({
    field,
    value,
    onChange,
}: ValueFieldProps<StringListFieldDescriptor, readonly string[]>) {
    const [local, setLocal] = useState(value.join(','));
    useEffect(() => {
        setLocal(value.join(','));
    }, [value]);

    const commit = () => {
        const parsed = parseStringList(local);
        if (parsed.join(',') !== value.join(',')) onChange(parsed);
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
            <input
                className="input-field"
                type="text"
                value={local}
                placeholder={field.placeholder}
                onChange={(e) => setLocal(e.target.value)}
                onBlur={commit}
                onKeyDown={(e) => e.key === 'Enter' && commit()}
            />
        </div>
    );
}
