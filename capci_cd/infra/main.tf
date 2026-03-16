resource "aws_s3_bucket" "public_bucket" {
  bucket = "example-public-bucket"
  acl    = "public-read"
}

resource "aws_security_group" "open_sg" {
  name = "open-sg"

  ingress {
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_db_instance" "db" {
  identifier          = "example-db"
  engine              = "postgres"
  instance_class      = "db.t3.micro"
  publicly_accessible = true
}

resource "aws_eks_cluster" "cluster" {
  name = "example-eks"

  vpc_config {
    endpoint_public_access = true
  }
}
