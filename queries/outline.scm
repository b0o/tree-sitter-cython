(decorator) @annotation

(class_definition
    "class" @context
    name: (identifier) @name
    ) @item

(function_definition
    "async"? @context
    "def" @context
    name: (_) @name) @item

(cdef_statement
    ["cdef" "cpdef"] @context
    (cvar_def
        (maybe_typed_name
            name: (_) @name)
        (c_function_definition))) @item
