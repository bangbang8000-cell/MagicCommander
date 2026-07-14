"""Core logic tests for MagicCommander backend."""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import numpy as np
from base import json_safe_val, string_split, remove_empty_pair, Base


class TestJsonSafeVal:
    def test_converts_numpy_int64(self):
        val = np.int64(42)
        result = json_safe_val(val)
        assert result == 42
        assert isinstance(result, int)

    def test_converts_list_of_numpy(self):
        val = [np.int64(1), np.int64(2)]
        result = json_safe_val(val)
        assert result == [1, 2]
        assert all(isinstance(x, int) for x in result)

    def test_passes_through_regular_values(self):
        assert json_safe_val("hello") == "hello"
        assert json_safe_val(3.14) == 3.14
        assert json_safe_val(True) is True

    def test_nested_list_with_mixed(self):
        val = [np.int64(1), "str", np.int64(3)]
        result = json_safe_val(val)
        assert result == [1, "str", 3]


class TestStringSplit:
    def test_regular_string(self):
        assert string_split("hello", "test") == "hello"

    def test_comma_split(self):
        result = string_split("a,b,c", "test")
        assert result == ['list', 'a', 'b', 'c']

    def test_newline_split(self):
        result = string_split("a\nb\nc", "test")
        assert result == ['list', 'a', 'b', 'c']

    def test_chinese_comma_split(self):
        result = string_split("a，b，c", "test")
        assert result == ['list', 'a', 'b', 'c']

    def test_double_separator_error(self):
        result = string_split("a,b\nc", "test")
        assert 'split_error' in result

    def test_numpy_int64_passthrough(self):
        result = string_split(np.int64(42), "test")
        assert result == np.int64(42)

    def test_non_string_passthrough(self):
        result = string_split(123, "test")
        assert result == 123


class TestRemoveEmptyPair:
    def test_removes_empty_strings(self):
        d = {'a': 1, 'b': '', 'c': 'hello'}
        remove_empty_pair(d)
        assert d == {'a': 1, 'c': 'hello'}

    def test_removes_none_values(self):
        d = {'a': 1, 'b': None}
        remove_empty_pair(d)
        assert d == {'a': 1}

    def test_keeps_truthy_values(self):
        """0 和 False 是 Python falsy 值，会被 remove_empty_pair 移除（符合文档语义）"""
        d = {'a': 1, 'b': 'hello', 'c': 0, 'd': False}
        remove_empty_pair(d)
        assert d == {'a': 1, 'b': 'hello'}
