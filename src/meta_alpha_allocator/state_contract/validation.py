from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any


_VALIDATION_MODE = 'BLS_CONTRACT_VALIDATION_MODE'


class ContractValidationError(RuntimeError):
    pass


class ValidationResult(dict):
    @property
    def valid(self) -> bool:
        return bool(self.get('valid'))


def validation_mode() -> str:
    value = os.environ.get(_VALIDATION_MODE, 'warn').strip().lower()
    return value if value in {'off', 'warn', 'strict'} else 'warn'


def load_contract_schema() -> dict[str, Any]:
    path = Path(__file__).resolve().parents[3] / 'contracts' / 'bls_state_v1.schema.json'
    return json.loads(path.read_text(encoding='utf-8'))


def _type_ok(expected: Any, value: Any) -> bool:
    if isinstance(expected, list):
        return any(_type_ok(item, value) for item in expected)
    mapping = {
        'object': lambda v: isinstance(v, dict),
        'array': lambda v: isinstance(v, list),
        'string': lambda v: isinstance(v, str),
        'integer': lambda v: isinstance(v, int) and not isinstance(v, bool),
        'number': lambda v: isinstance(v, (int, float)) and not isinstance(v, bool),
        'null': lambda v: v is None,
        'boolean': lambda v: isinstance(v, bool),
    }
    check = mapping.get(expected)
    return True if check is None else check(value)


def _validate(schema: dict[str, Any], value: Any, path: str, errors: list[str]) -> None:
    schema_type = schema.get('type')
    if schema_type is not None and not _type_ok(schema_type, value):
        errors.append(f'{path}: expected {schema_type}, got {type(value).__name__}')
        return
    if 'const' in schema and value != schema['const']:
        errors.append(f"{path}: expected const {schema['const']!r}")
    if 'enum' in schema and value not in schema['enum']:
        errors.append(f'{path}: value {value!r} not in enum')
    if value is None:
        return
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        minimum = schema.get('minimum')
        maximum = schema.get('maximum')
        if minimum is not None and value < minimum:
            errors.append(f'{path}: {value} < minimum {minimum}')
        if maximum is not None and value > maximum:
            errors.append(f'{path}: {value} > maximum {maximum}')
    if isinstance(value, dict):
        required = schema.get('required', [])
        properties = schema.get('properties', {})
        for key in required:
            if key not in value:
                errors.append(f'{path}: missing required key {key}')
        additional_allowed = schema.get('additionalProperties', True)
        if additional_allowed is False:
            unknown = sorted(set(value.keys()) - set(properties.keys()))
            for key in unknown:
                errors.append(f'{path}: unexpected key {key}')
        for key, prop_schema in properties.items():
            if key in value:
                _validate(prop_schema, value[key], f'{path}.{key}', errors)
    elif isinstance(value, list):
        item_schema = schema.get('items')
        if item_schema:
            for idx, item in enumerate(value):
                _validate(item_schema, item, f'{path}[{idx}]', errors)


def validate_contract(payload: dict[str, Any]) -> ValidationResult:
    schema = load_contract_schema()
    errors: list[str] = []
    _validate(schema, payload, '$', errors)
    return ValidationResult({
        'valid': not errors,
        'errors': errors,
        'error_count': len(errors),
        'mode': validation_mode(),
    })
