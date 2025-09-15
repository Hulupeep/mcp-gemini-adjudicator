#!/bin/bash

# Utility script to extract quantities from prompts
# Used by test suite

extract_quantity_from_text() {
    local text="$1"

    # Word to number mapping
    declare -A word_numbers=(
        ["one"]=1 ["two"]=2 ["three"]=3 ["four"]=4 ["five"]=5
        ["six"]=6 ["seven"]=7 ["eight"]=8 ["nine"]=9 ["ten"]=10
        ["eleven"]=11 ["twelve"]=12 ["thirteen"]=13 ["fourteen"]=14 ["fifteen"]=15
        ["sixteen"]=16 ["seventeen"]=17 ["eighteen"]=18 ["nineteen"]=19 ["twenty"]=20
        ["thirty"]=30 ["forty"]=40 ["fifty"]=50 ["hundred"]=100
    )

    # First try to extract numeric digits
    if echo "$text" | grep -qE '[0-9]+'; then
        echo "$text" | grep -oE '[0-9]+' | head -1
        return 0
    fi

    # Then try word numbers
    local lower_text=$(echo "$text" | tr '[:upper:]' '[:lower:]')
    for word in "${!word_numbers[@]}"; do
        if [[ "$lower_text" == *"$word"* ]]; then
            echo "${word_numbers[$word]}"
            return 0
        fi
    done

    # Check for "all" or "every"
    if [[ "$lower_text" == *"all"* ]] || [[ "$lower_text" == *"every"* ]]; then
        echo "ALL"
        return 0
    fi

    # Default to 0 if no quantity found
    echo "0"
}

# If script is called with argument
if [ $# -gt 0 ]; then
    extract_quantity_from_text "$1"
else
    # Read from stdin
    read -r input
    extract_quantity_from_text "$input"
fi