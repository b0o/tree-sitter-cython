/**
 * @file Cython grammar for tree-sitter
 * @author Amaan Qureshi <amaanq12@gmail.com>
 * @license MIT
 * @see {@link https://github.com/bazelbuild/cython|official website}
 * @see {@link https://github.com/bazelbuild/cython/blob/master/spec.md|official syntax spec}
 * @see {@link https://bazel.build/rules/language|official language guide}
 */

/// <reference types="tree-sitter-cli/dsl" />
// @ts-check

const Python = require("tree-sitter-python/grammar");

const PREC = Object.assign({}, Python.PREC, {
  keyword_identifier: -3,
  c_type: 1,
  gil_spec_exception_value: 1,
  new: 23,
  cast: 24,
});

module.exports = grammar(Python, {
  name: "cython",

  conflicts: ($, original) =>
    original.filter((conflict) => {
      const unnecessaryConflicts = [
        ["match_statement", "primary_expression"],
        ["type_alias_statement", "primary_expression"],
      ];

      return !unnecessaryConflicts.some(pair => (
        conflict.length === 2
        && ("name" in conflict[0] && conflict[0].name === pair[0])
        && ("name" in conflict[1] && conflict[1].name === pair[1])
      ));
    }).concat([
      [$.maybe_typed_name],
      [$.c_name, $.cvar_decl],
    ]),

  rules: {
    module: $ => seq(optional($.run_directive), repeat($._statement)),

    run_directive: $ => seq("PYTHON", /[^\r\n]+/, $._newline),

    c_integer_signedness: $ =>
      /[uU]/,

    c_integer_type: $ => choice(
      seq(
        optional($.c_integer_signedness),
        /[lL]/,
        optional(/[lL]/),
      ),
      $.c_integer_signedness,
    ),

    integer: $ => choice(
      seq(
        choice("0x", "0X"),
        repeat1(/_?[A-Fa-f0-9]+/),
        optional($.c_integer_type),
      ),
      seq(
        choice("0o", "0O"),
        repeat1(/_?[0-7]+/),
        optional($.c_integer_type),
      ),
      seq(
        choice("0b", "0B"),
        repeat1(/_?[0-1]+/),
        optional($.c_integer_type),
      ),
      seq(
        repeat1(/[0-9]+_?/),
        choice(
          optional($.c_integer_type), // long numbers
          optional(/[jJ]/), // complex numbers
        ),
      ),
    ),

    // Cython allows 'cimport'
    import_statement: $ =>
      seq(
        choice("import", "cimport"),
        $._import_list,
      ),

    import_from_statement: $ =>
      seq(
        "from",
        field(
          "module_name",
          choice(
            $.relative_import,
            $.dotted_name,
          ),
        ),
        choice("import", "cimport"),
        choice(
          $.wildcard_import,
          $._import_list,
          seq("(", $._import_list, ")"),
        ),
      ),

    class_definition: $ =>
      seq(
        repeat($.storageclass),
        "class",
        field("name", $.identifier),
        repeat(seq(".", $.identifier)),
        optional(seq("(", $.c_type, ")")),
        choice(
          field("name_specification", $.external_definition),
          seq(
            field("superclasses", optional($.argument_list)),
            ":",
            field("body", $._suite),
          ),
          seq(
            field("superclasses", optional($.argument_list)),
            field("name_specification", $.external_definition),
            ":",
            field("body", $._suite),
          ),
          $._newline,
        ),
      ),
    external_definition: $ =>
      seq(
        "[",
        commaSep1(seq(choice("object", "type"), $.c_type)),
        "]",
      ),

    property_definition: $ =>
      seq(
        "property",
        $.identifier,
        ":",
        field("body", $._suite),
      ),

    include_statement: $ =>
      seq(
        "include",
        choice(
          $.string,
          seq("<", $.string, ">"),
        ),
      ),

    _simple_statement: ($, original) =>
      choice(
        original,
        $.include_statement,
      ),

    _compound_statement: ($, original) =>
      choice(
        original,
        $.DEF_statement,
        $.IF_statement,
        $.cdef_statement,
        $.ctypedef_statement,
        $.property_definition,
      ),

    decorated_definition: $ =>
      seq(
        repeat1($.decorator),
        field(
          "definition",
          choice(
            $.class_definition,
            $.function_definition,
            $.cdef_statement,
          ),
        ),
      ),

    DEF_statement: $ =>
      seq(
        "DEF",
        field("name", $.identifier),
        "=",
        $.expression,
        $._newline,
      ),

    IF_statement: $ => seq(
      "IF",
      field("condition", $.expression),
      ":",
      field("consequence", $._suite),
      repeat(field("alternative", $.ELIF_clause)),
      optional(field("alternative", $.ELSE_clause)),
    ),

    ELIF_clause: $ => seq(
      "ELIF",
      field("condition", $.expression),
      ":",
      field("consequence", $._suite),
    ),

    ELSE_clause: $ => seq(
      "ELSE",
      ":",
      field("body", $._suite),
    ),

    cdef_statement: $ =>
      seq(
        choice("cdef", "cpdef"),
        choice(
          $.cvar_def,
          $.cdef_type_declaration,
          $.extern_block,
          $.cdef_definition_block,
        ),
      ),

    cdef_definition_block: $ =>
      seq(
        repeat($.storageclass),
        optional(choice($.identifier, $.keyword_identifier)),
        ":",
        $._indent,
        repeat1(choice($.cvar_def, $.ctypedef_statement, $.cdef_type_declaration, $.extern_block)),
        $._dedent,
      ),

    cvar_def: $ =>
      seq(
        repeat($.storageclass),
        $.maybe_typed_name,
        choice(
          seq(
            optional(seq("=", $.expression)),
            repeat(seq(
              ",",
              optional($.type_modifier),
              $.identifier,
              optional(seq("=", $.expression)),
            )),
            optional(","),
            $._newline,
          ),
          $.c_function_definition,
        ),
      ),

    cdef_type_declaration: $ => choice($.ctype_declaration, $.fused, $.class_definition),

    extern_block: $ =>
      seq(
        "extern",
        optional(seq(
          "from",
          choice($.string, "*"),
          optional(seq("namespace", $.string)),
          optional("nogil"),
        )),
        choice(
          seq(":", $.extern_suite),
          $.class_definition,
          $.cvar_def,
        ),
      ),

    extern_suite: $ =>
      choice(
        $.pass_statement,
        seq(
          $._indent,
          choice(
            repeat1(choice(
              seq(
                optional(choice("cdef", "cpdef")),
                choice($.cvar_decl, $.cdef_type_declaration),
              ),
              $.ctypedef_statement,
              $.string,
            )),
            $.pass_statement,
          ),
          $._dedent,
        ),
        alias($._newline, $.block),
      ),

    ctype_declaration: $ => choice($.struct, $.enum, $.cppclass),

    cvar_decl: $ =>
      seq(
        repeat($.storageclass),
        $.c_type,
        optional(seq($.c_name, optional(field("alias", $.string)))),
        choice(
          seq(
            $.identifier,
            optional(field("alias", $.string)),
            repeat($.type_index),
            optional(seq("=", $.expression)),
            repeat(seq(
              ",",
              $.c_identifier,
              optional(seq("=", $.expression)),
            )),
            $._newline,
          ),
          $.c_function_definition,
        ),
      ),

    int_type: $ =>
      prec.right(choice(
        seq(
          $._signedness,
          optional($._longness),
        ),
        $._longness,
        seq(
          optional($._signedness),
          optional($._longness),
          choice("int", "double"),
        ),
        "complex",
      )),

    operator_name: $ =>
      seq(
        "operator",
        choice(
          "co_await",
          "+",
          "-",
          "*",
          "/",
          "%",
          "^",
          "&",
          "|",
          "~",
          "!",
          "=",
          "<",
          ">",
          "+=",
          "-=",
          "*=",
          "/=",
          "%=",
          "^=",
          "&=",
          "|=",
          "<<",
          ">>",
          ">>=",
          "<<=",
          "==",
          "!=",
          "<=",
          ">=",
          "<=>",
          "&&",
          "||",
          "++",
          "--",
          ",",
          "->*",
          "->",
          "()",
          "[]",
          "xor",
          "bitand",
          "bitor",
          "compl",
          "not",
          "xor_eq",
          "and_eq",
          "or_eq",
          "not_eq",
          "and",
          "or",
          seq(choice("new", "delete"), optional("[]")),
          seq("\"\"", $.identifier),
        ),
      ),

    _signedness: _ => choice("signed", "unsigned"),
    _longness: _ =>
      prec.right(choice(
        "char",
        "short",
        "long",
        alias(seq("long", "long"), "long long"),
      )),

    type_qualifier: $ =>
      repeat1(choice("const", "volatile")),

    // type: ['const'] (NAME ('.' PY_NAME)* | int_type | '(' type ')') ['complex'] [type_modifier]
    c_type: $ =>
      prec.right(
        PREC.c_type,
        seq(
          optional($.type_qualifier),
          choice(
            seq(
              field("type", $.identifier),
              repeat(seq(
                ".",
                $.identifier,
              )),
            ),
            $.int_type,
            seq("(", $.c_type, ")"),
          ),
          optional("complex"),
          repeat($.type_modifier),
        ),
      ),

    c_name: $ =>
      seq(optional($.type_modifier), $.identifier),

    maybe_typed_name: $ =>
      choice(
        seq(
          optional($.type_qualifier),
          field("type", choice($.identifier, $.int_type)),
          optional(seq(
            repeat(seq(
              ".",
              $.identifier,
            )),
            optional("complex"),
            repeat($.type_modifier),
          )),
          field("name", optional(choice($.identifier, $.operator_name, $.c_function_pointer_name))),
          repeat($.type_modifier),
        ),
        seq(
          optional($.type_qualifier),
          field("name", choice($.identifier, $.operator_name)),
          repeat($.type_modifier),
        ),
      ),

    c_function_pointer_type: $ =>
      seq(
        $.c_type,
        "(", "*", ")",
        $.c_parameters,
      ),


    c_function_pointer_name: $ =>
      seq("(", "*", $.c_identifier, ")"),

    c_function_pointer: $ =>
      seq(
        $.c_type,
        $.c_function_pointer_name,
        $.c_parameters,
      ),

    // type_modifier: '*' | '**' | '&' | type_index ('.' NAME [type_index])*
    type_modifier: $ =>
      choice(
        "*",
        seq("*", "const"),
        "**",
        "&",
        "__stdcall",
        seq(
          $.type_index,
          repeat(seq(
            ".",
            $.identifier,
            optional($.type_index),
          )),
        ),
      ),

    type_index: $ =>
      seq(
        "[",
        optional(choice(
          $.integer,
          commaSep1(seq($.c_type, optional(seq("=", $.expression)))),
          commaSep1($.memory_view_index),
        )),
        "]",
      ),
    memory_view_index: $ =>
      seq(
        ":",
        optional($.expression),
        optional(seq(
          ":",
          optional($.expression),
        )),
      ),

    ctypedef_statement: $ =>
      seq(
        repeat($.storageclass),
        "ctypedef",
        choice($.cvar_decl, $.c_function_pointer, $.struct, $.enum, $.fused, $.class_definition, $.extern_block),
        optional(";"),
      ),

    c_function_declaration: $ =>
      seq(
        optional($.template_params),
        $.c_parameters,
        optional($.gil_spec),
        optional($.exception_value),
        optional($.gil_spec),
      ),

    c_function_definition: $ =>
      seq(
        optional($.template_params),
        $.c_parameters,
        optional($.gil_spec),
        optional($.exception_value),
        optional($.gil_spec),
        optional("const"),
        choice(
          seq(":", $._suite),
          $._newline,
        ),
      ),

    template_default: $ =>
      seq("=", "*"),

    template_param: $ =>
      seq($.identifier, optional($.template_default)),

    template_params: $ =>
      seq(
        "[",
        commaSep1($.template_param),
        "]",
      ),

    c_parameters: $ => seq("(", optional($._typedargslist), ")"),

    // e.g.
    // int (*)(const char, int)
    // int (*func)(const char, int)
    c_function_argument_type: $ =>
      seq($.c_type, "(", "*", optional($.identifier), ")", $.c_parameters),

    _typedargument: $ =>
      seq(
        $.maybe_typed_name,
        optional(seq(":", $.c_type)),
        optional(seq("=", choice($.expression, "*"))),
      ),

    _typedargslist: $ =>
      choice(
        "...",
        seq(
          commaSep1(choice($._typedargument, $.c_function_argument_type)),
          optional(seq(",", "...")),
          optional(","),
        ),
      ),

    gil_spec: _ => choice(seq("with", choice("gil", "nogil")), "nogil"),
    exception_value: $ =>
      choice(
        prec(
          PREC.gil_spec_exception_value,
          seq(
            "except",
            choice(
              seq(optional("?"), $.expression),
              "*",
              seq("+", optional($.identifier)),
            ),
          ),
        ),
        "noexcept",
      ),

    typed_parameter: $ =>
      prec(
        PREC.typed_parameter,
        choice(
          seq(
            field("type", $.c_type),
            choice(
              seq($.identifier, optional($.type_index)),
              $.list_splat_pattern,
              $.dictionary_splat_pattern,
            ),
            optional(seq(
              choice("not", "or"),
              "None",
            )),
          ),
          seq(
            choice(
              $.identifier,
              $.list_splat_pattern,
              $.dictionary_splat_pattern,
            ),
            ":",
            field("type", $.type),
          ),
        ),
      ),

    typed_default_parameter: $ =>
      prec(
        PREC.typed_parameter,
        seq(
          field("type", $.c_type),
          field("name", $.identifier),
          optional($.type_index),
          "=",
          field("value", $.expression),
        ),
      ),

    struct: $ =>
      seq(
        repeat($.storageclass),
        choice("struct", "union"),
        $.c_identifier,
        choice($._newline, seq(":", $.struct_suite)),
      ),
    struct_suite: $ =>
      choice(
        $.pass_statement,
        seq(
          $._indent,
          choice(
            repeat(choice($.cvar_decl, $.c_function_pointer)),
            $.pass_statement,
          ),
          $._dedent,
        ),
        alias($._newline, $.block),
      ),

    enum: $ =>
      seq(
        repeat($.storageclass),
        "enum",
        optional(choice("class", "struct")),
        optional(
          seq(
            $.identifier,
            optional(seq("(", $.c_type, ")")),
          ),
        ),
        ":",
        choice($._enum_suite, $._enum_statements),
        $._newline),

    _enum_suite: $ => seq(
      $._indent,
      $.enum_block,
      $._dedent),

    enum_block: $ => seq(
      repeat1($._enum_statements),
    ),

    _enum_statements: $ => commaSep1($._enum_statement),

    _enum_statement: $ => seq(
      $.c_identifier, optional(seq("=", $.expression)),
    ),

    // Optional alias used in underlying C library
    c_identifier: $ =>
      seq(field("name", $.identifier), optional(field("alias", $.string))),

    cppclass: $ =>
      seq(
        "cppclass",
        $.c_identifier,
        optional($.template_params),
        optional("nogil"),
        choice($._newline, seq(":", $._cppclass_suite)),
      ),

    _cppclass_suite: $ =>
      choice(
        $.pass_statement,
        seq(
          $._indent,
          repeat(choice(
            $.ctypedef_statement,
            $.cvar_def,
            $.cppclass,
          )),
          $._dedent,
        ),
      ),

    fused: $ =>
      seq(
        "fused",
        $.identifier,
        ":",
        $._indent,
        repeat(seq(
          $.c_type,
          $._newline,
        )),
        $._dedent,
      ),

    storageclass: _ => choice("public", "packed", "inline", "api", "readonly"),

    expression: ($, original) =>
      choice(
        original,
        $.new_expression,
      ),

    primary_expression: ($, original) =>
      choice(
        original,
        $.cast_expression,
        $.sizeof_expression,
      ),

    new_expression: $ =>
      prec(
        PREC.new,
        seq(
          "new",
          $.c_type,
          $.argument_list,
        ),
      ),

    sizeof_expression: $ =>
      prec(
        PREC.new,
        seq(
          "sizeof",
          "(",
          choice($.c_function_argument_type, $.c_type, $.expression),
          ")",
        ),
      ),

    cast_expression: $ =>
      prec(
        PREC.cast,
        seq(
          "<",
          choice($.c_type, $.c_function_pointer_type),
          optional("?"),
          ">",
          $.expression,
        ),
      ),

    unary_operator: $ =>
      prec(
        PREC.unary,
        seq(
          field("operator", choice("+", "-", "~", "&")),
          field("argument", $.primary_expression),
        ),
      ),

    _comprehension_for_clause: $ =>
      choice($.for_in_clause,
        seq(optional("async"),
          "for",
          $.for_from_loop),
      ),

    _comprehension_clauses: $ => seq(
      $._comprehension_for_clause,
      repeat(choice(
        $._comprehension_for_clause,
        $.if_clause,
      )),
    ),

    for_in_loop: $ =>
      seq(
        field("left", $._left_hand_side),
        "in",
        field("right", commaSep1($.primary_expression)),
      ),

    for_from_relation: $ =>
      choice("<", "<=", ">", ">="),

    for_from_loop: $ =>
      seq(
        optional(
          seq(
            field("left", $.identifier),
            "from",
          ),
        ),
        field("lower", choice($.primary_expression)),
        $.for_from_relation,
        field("var", $.identifier),
        $.for_from_relation,
        field("upper", choice($.primary_expression)),
        optional(seq(
          "by",
          $._expressions,
        )),
      ),

    for_statement: $ =>
      seq(
        optional("async"),
        "for",
        choice($.for_from_loop, $.for_in_loop),
        ":",
        field("body", $._suite),
        field("alternative", optional($.else_clause)),
      ),

    keyword_identifier: $ =>
      prec(
        PREC.keyword_identifier,
        alias(
          choice(
            "print",
            "exec",
            "async",
            "await",
            "match",
            "api",
          ),
          $.identifier,
        ),
      ),
  },
});

module.exports.PREC = PREC;

/**
 * Creates a rule to match one or more of the rules separated by a comma
 *
 * @param {Rule} rule
 *
 * @return {SeqRule}
 */
function commaSep1(rule) {
  return sep1(rule, ",");
}

/**
 * Creates a rule to match one or more of the rules separated by the separator
 *
 * @param {Rule} rule
 * @param {string} separator - The separator to use.
 *
 * @return {SeqRule}
 */
function sep1(rule, separator) {
  return seq(rule, repeat(seq(separator, rule)));
}
