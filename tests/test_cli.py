from app.cli import parse_connection_string


def test_parse_supabase_pooler_string():
    parsed = parse_connection_string(
        "postgresql://postgres.wgmdzfuvgkhyrlxlxckt:[YOUR-PASSWORD]@aws-0-us-east-1.pooler.supabase.com:5432/postgres"
    )
    assert parsed == {
        "user": "postgres.wgmdzfuvgkhyrlxlxckt",
        "host": "aws-0-us-east-1.pooler.supabase.com",
        "port": "5432",
        "database": "postgres",
    }


def test_parse_plain_host_is_not_a_url():
    assert parse_connection_string("aws-0-us-east-1.pooler.supabase.com") is None
